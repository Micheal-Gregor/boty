// Fortune draw resolution (Stage 3). The Fortune deck is the shared, seasonal source of
// everything that "happens to you" each turn. Draw power (number of tradespeople, capped)
// sets how many cards you pull, so a bigger shop sees more opportunity AND more chaos.
//
// Each drawn card resolves immediately by type:
//   • job      → enters your queue (Queued), as in Stage 2
//   • windfall → immediate cash gain (feast)
//   • shock    → immediate cash hit / dead turn (famine)
//   • gift     → deals you a Civil hand card (sabotage/rush/buy-time/slick-lawyer) to hold;
//                inert until Stage 4 wires up the response window. No-op if that pile is dry.

import { w, findEquipment } from "./economy.js";
import { createJob, createPayable, createTradesman, createDefect } from "../state/state.js";
import { post, cashIn, cashOut, ACCT } from "../state/ledger.js";
import { bearLoss, marketingInjection } from "./modifiers.js";
import { applyCrewEvent } from "./crew.js";
import { applyIncident } from "./incidents.js";
import { startProject } from "./projects.js";
import { performanceReview } from "./employment.js";
import { applyGlobal } from "./globals.js";
import { resolveCivilEvent } from "./payables.js";
import { releaseTradesman } from "./jobs.js";
import { seasonName } from "./season.js";

/**
 * Cash impact of a card, including the count-scaling terms that tie value to your build:
 * `per_equipment` (rewards/penalises owning gear — the patent lever) and `per_tradesman`
 * (rewards/penalises headcount — the profit-share lever). These are the structural levers
 * that make the equipment-vs-hire opening a real choice (Dial 3).
 */
function cashEffect(player, card) {
  let amount = card.cash ?? 0;
  if (card.per_equipment) amount += card.per_equipment * player.equipment.length;
  if (card.per_tradesman) amount += card.per_tradesman * player.tradesmen.length;
  return amount;
}

function cashLine(card, amount) {
  const detail = [
    card.per_equipment ? `${card.per_equipment > 0 ? "+" : ""}${card.per_equipment}/equipment` : null,
    card.per_tradesman ? `${card.per_tradesman > 0 ? "+" : ""}${card.per_tradesman}/employee` : null,
  ].filter(Boolean).join(", ");
  const sign = amount >= 0 ? "💰 +" : "⚡ ";
  return `${sign}${w(Math.abs(amount))}${detail ? ` (${detail})` : ""}`;
}

/** Phase 2 — draw `count` Fortune cards for the player and resolve each. Returns summaries. */
export function drawFortune(state, player, count) {
  const cards = (player.deck ?? state.deck).drawN(count); // per-player deck (Stage: living deck)
  const injected = marketingInjection(player); // marketing brings in extra work
  if (injected) cards.unshift(injected);
  const season = seasonName(state);
  // Carry each card's cosmetic flavor onto its summary — a season-specific variant if the card
  // has one (flavor_by_season), else its plain flavor.
  return cards.map((card) => ({
    cardId: card.id, // stable key for art lookup in the UI
    flavor: card.flavor_by_season?.[season] ?? card.flavor ?? null,
    ...resolveCard(state, player, card),
  }));
}

/**
 * Choose the client for a forced job: the richest other non-bankrupt player (deterministic;
 * ties break to the lowest seat). Routing forced work toward the leader gives the deck a lever
 * against a runaway. Returns null when the contractor is the only solvent player.
 */
/**
 * Find a player with the given trade to take a routed job: another solvent player whose service
 * matches and who has spare contract capacity. A shop can carry one routed job PER tradesperson
 * (at least one) — so a bigger crew takes on more contracts, and overcommitting risks botches.
 * Returns null if none — the drawer then does the job themselves (NPC fallback).
 */
function routedHeld(p) {
  return p.jobs.filter((j) => j.hirer_id).length;
}
function pickContractor(state, hirer, trade) {
  return state.players.find(
    (p) => p !== hirer && !p.bankrupt && p.service === trade && routedHeld(p) < Math.max(1, p.tradesmen.length),
  ) ?? null;
}

// The tailored job ladder — per-trade names for each of the 6 sizes (j1…j6), and the art key.
const JOB_LADDER = {
  "mechanic":       ["Brake job", "Tune-up", "Transmission", "Engine rebuild", "Fleet contract", "Restoration shop"],
  "plumber":        ["Clogged drain", "Water heater", "Section re-pipe", "Main-line dig", "Building plumbing", "Commercial system"],
  "electrician":    ["Fixture swap", "Panel upgrade", "Room rewire", "Service upgrade", "Building wiring", "Commercial electrical"],
  "pipefitter":     ["Fitting repair", "Steam-line patch", "Process pipe", "Boiler job", "Plant piping", "Industrial system"],
  "welder":         ["Railing weld", "Gate & fence", "Structural repair", "Custom fab", "Structural steel", "Industrial fab"],
  "HVAC technician":["A/C service", "Furnace swap", "Ductwork run", "Rooftop unit", "Building HVAC", "Commercial system"],
};
const SIZE_IDX = { j1: 0, j2: 1, j3: 2, j4: 3, j5: 4, j6: 5 };
const tradeSlug = (s) => (s === "HVAC technician" ? "hvac" : (s ?? "").toLowerCase());
const jobArt = (size, trade) =>
  size === "j1" ? "job/walkin/1p" : size === "j2" ? "job/walkin/2p" : size === "j3" ? "job/walkin/2p_basic" : `job/${size}/${tradeSlug(trade)}`;

/** Skin a generic j1–j6 card to the drawer's trade: per-trade name + the size's stats + art key. */
function tailorJob(economy, card, trade) {
  const sz = economy.job_sizes?.[card.size];
  if (!sz) return card;
  return {
    ...card,
    name: (JOB_LADDER[trade] ?? [])[SIZE_IDX[card.size]] ?? card.name ?? "Job",
    value: sz.value, work_amount: sz.work, deadline: sz.deadline, terms: sz.terms ?? null,
    min_tradesmen: 1, max_tradesmen: sz.crew,
    required_equipment: sz.equip ?? null,
    equipment_per_tradesman: sz.gear_all ?? false,
    required_building_tier: sz.tier ?? 1,
    required_trade: null, droppable: card.droppable ?? true,
    art: jobArt(card.size, trade),
  };
}

function resolveCard(state, player, card) {
  switch (card.type) {
    case "job": {
      // The tailored ladder: a generic j1–j6 card skins to the drawer's trade (always their own
      // job — no routing), so every trade sees the identical work. JOB-CARDS-PLAN Part B1.
      const drawn = card.size ? tailorJob(state.economy, card, player.service) : card;
      const job = createJob(drawn, state.turn);
      // Subcontract job: you broker it. A rival running `sub_trade` does the work for `sub_cost`;
      // you (the GC) bill the customer `value` on delivery and pocket the markup — or factor the
      // invoice to break even. The sub holds the job; you hold the AP that pays them.
      if (job.subcontract && player.service !== job.sub_trade) {
        const sub = pickContractor(state, player, job.sub_trade);
        if (sub) {
          job.hirer_id = player.id;
          sub.jobs.push(job);
          player.payables.push(createPayable({
            vendor: `${sub.name} (sub: ${job.name})`, amount: job.sub_cost, dueTurn: null,
            isNpc: false, creditorId: sub.id, jobId: job.id, pending: true,
          }));
          const markup = Math.round((job.value / job.sub_cost - 1) * 100);
          return { type: "job", name: card.name, job, routedTo: sub.id,
            text: `subcontracted to ${sub.name} (the ${job.sub_trade}) — you'll owe ${w(job.sub_cost)}, bill the customer ${w(job.value)} (${markup}% markup)` };
        }
        // No sub at the table → you keep it and do it yourself (capture the whole value) below.
      }
      // Trade-routed: if this job needs a trade the drawer lacks, refer it to a player who has
      // that trade — they do it as their own NPC-paid job; the drawer takes a finder's commission.
      if (job.required_trade && player.service !== job.required_trade) {
        const contractor = pickContractor(state, player, job.required_trade);
        if (contractor) {
          // You can't do it, so you refer the lead to the trade who can — and take a finder's
          // commission. The contractor does it as their own NPC-paid job (no debt between players).
          const commission = Math.max(1, Math.floor(job.value * state.economy.sell_rate));
          cashIn(state, player, ACCT.OTHER_INCOME, commission, `Referral commission — ${job.name}`);
          contractor.jobs.push(job); // hirer_id stays null → the contractor's own job
          return { type: "job", name: card.name, job, routedTo: contractor.id,
            text: `referred to ${contractor.name} (the ${job.required_trade}) — you take a ${w(commission)} commission` };
        }
      }
      // Otherwise it's the drawer's own job.
      player.jobs.push(job);
      return { type: "job", name: drawn.name, job, art: drawn.art ?? null, text: `new job ${job.id} (${w(job.value)}, due turn ${job.deadline_turn})` };
    }
    case "windfall":
    case "shock": {
      const amount = cashEffect(player, card);
      if (amount >= 0) {
        cashIn(state, player, ACCT.OTHER_INCOME, amount, card.name);
        return { type: card.type, name: card.name, cash: amount, text: cashLine(card, amount) };
      }
      // A loss — insurance turns it into a deductible (the rest is covered).
      const { borne, covered, insured } = bearLoss(player, -amount);
      cashOut(state, player, ACCT.REPAIRS, borne, card.name);
      const note = insured && covered > 0 ? ` — insured: paid the ${w(borne)} deductible, ${w(covered)} covered` : "";
      return { type: card.type, name: card.name, cash: -borne, text: cashLine(card, -borne) + note };
    }
    case "retirement": {
      // A tradesperson retires; you immediately hire a replacement (pay the sign-on fee). Net
      // headcount is unchanged, but it's a churn cost and the replacement is idle — any job the
      // retiree was on loses a worker. A penalty that grows in nuisance the more crews you run.
      if (player.tradesmen.length === 0) return { type: "retirement", name: card.name, text: "no staff to retire" };
      const retiree = player.tradesmen[0];
      releaseTradesman(state, player, retiree.id);
      player.tradesmen = player.tradesmen.filter((t) => t.id !== retiree.id);
      player.tradesmen.push(createTradesman());
      cashOut(state, player, ACCT.COGS_LABOUR, state.economy.sign_on_fee, "Retirement — replacement hire");
      return { type: "retirement", name: card.name, text: `👋 ${retiree.id} retired — hired a replacement for ${w(state.economy.sign_on_fee)}` };
    }
    case "gift": {
      const handCard = state.civilHandDeck.draw();
      if (handCard) player.hand.push(handCard);
      return { type: "gift", name: card.name, got: handCard?.name ?? null, text: handCard ? `🃏 drew ${handCard.name} to hand` : "nothing left to draw" };
    }
    case "bbb_special":
      // The BBB hosts a vendor fair: this turn you may buy services & shop improvements.
      player.bbbThisTurn = true;
      return { type: "bbb_special", name: card.name, text: "🏛️ the BBB vendor fair is in town — buy services & improvements this turn" };
    case "character": {
      // Most characters skin existing card types; this handles their bespoke effects.
      if (card.effect === "donation") {
        // The Mayor's re-election drive: the player decides whether to chip in (buy a Favor + seed
        // networking_lunch into their deck). Deferred to a pending decision.
        state.pendingMayor.push({ playerId: player.id });
        return { type: "character", name: card.name, text: `Mayor Crabtree's passing the hat — chip in for a Favor, or pass` };
      }
      return { type: "character", name: card.name, text: card.text ?? "" };
    }
    case "incident":
      return applyIncident(state, player, card);
    case "project":
      return { type: "project", name: card.name, text: startProject(state, player, card) };
    case "crew":
      return applyCrewEvent(state, player, card);
    case "theft": {
      // A rig is stolen: insured → pay the deductible and it's replaced; uninsured → written off.
      const owned = player.equipment.filter((e) => e.owned);
      if (!owned.length) return { type: "theft", name: card.name, text: "nothing worth stealing" };
      const eq = owned[0];
      const def = findEquipment(state.economy, eq.defId);
      const { borne, insured } = bearLoss(player, def.buy_cost);
      let text;
      if (insured) {
        cashOut(state, player, ACCT.REPAIRS, borne, `${card.name} — deductible`);
        text = `${def.name} stolen but insured — ${w(borne)} deductible, replaced`;
      } else {
        player.equipment = player.equipment.filter((e) => e.id !== eq.id);
        post(state, player, `${card.name} — ${def.name} written off`, [
          { acct: ACCT.LEGAL, amt: def.buy_cost },
          { acct: ACCT.EQUIPMENT, amt: -def.buy_cost },
        ]);
        text = `${def.name} stolen — written off (${w(def.buy_cost)})`;
      }
      // 50/50 it was an inside job → flag a tradesperson (grounds to fire them with cause).
      const suspect = player.tradesmen.find((t) => t.flag == null);
      if (state.die() <= 3 && suspect) { suspect.flag = "theft"; text += ` — looks like an inside job: ${suspect.id} is flagged`; }
      return { type: "theft", name: card.name, text };
    }
    case "review":
      return { type: "review", name: card.name, text: performanceReview(state, player).join("; ") };
    case "union":
      return { type: "union", name: card.name, text: applyGlobal(state, { name: "Town labor union", kind: "union", magnitude: 0, turns: 99 }) };
    case "defect": {
      const defect = createDefect(card, state.turn);
      player.defects.push(defect);
      const route = card.fix_trade ? ` (a ${card.fix_trade} fixes it)` : "";
      return { type: "defect", name: card.name, defect, text: `🚧 code violation: −${defect.productivity_hit} output and ${w(defect.fine)}/turn until you fix it for ${w(defect.fix_cost)}${route}` };
    }
    case "payable": {
      const ap = createPayable({ vendor: card.name, amount: card.amount, dueTurn: state.turn + (card.due ?? 3), isNpc: true });
      player.payables.push(ap);
      return { type: "payable", name: card.name, text: `🧾 vendor bill ${ap.id}: ${w(ap.amount)} due turn ${ap.due_turn}` };
    }
    case "summons": {
      const event = state.civilEventDeck.draw();
      if (!event) return { type: "summons", name: card.name, text: "courthouse closed (no event)" };
      const lines = resolveCivilEvent(state, player, event);
      return { type: "summons", name: card.name, event: event.name, text: lines.join("; ") };
    }
    default:
      return { type: card.type ?? "unknown", name: card.name ?? "?", text: "(unhandled card type)" };
  }
}
