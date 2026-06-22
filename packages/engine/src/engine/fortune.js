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
  const cards = state.deck.drawN(count);
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

function resolveCard(state, player, card) {
  switch (card.type) {
    case "job": {
      const job = createJob(card, state.turn);
      // Trade-routed: if this job needs a trade the drawer lacks, route it to a player who has
      // that trade — they do the work, the drawer (hirer) owes the contract value on completion.
      if (job.required_trade && player.service !== job.required_trade) {
        const contractor = pickContractor(state, player, job.required_trade);
        if (contractor) {
          job.hirer_id = player.id;
          contractor.jobs.push(job);
          player.payables.push(createPayable({
            vendor: `${contractor.name} (${job.name})`, amount: job.value, dueTurn: null,
            isNpc: false, creditorId: contractor.id, jobId: job.id, pending: true,
          }));
          return { type: "job", name: card.name, job, routedTo: contractor.id,
            text: `routed to ${contractor.name} (the ${job.required_trade}) — you owe ${w(job.value)} on completion` };
        }
      }
      // Otherwise it's the drawer's own job.
      player.jobs.push(job);
      return { type: "job", name: card.name, job, text: `new job ${job.id} (${w(job.value)}, due turn ${job.deadline_turn})` };
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
        // The Mayor's re-election drive: chip in and you're owed a favor.
        const cost = card.cost ?? 2;
        if (player.cash >= cost) {
          cashOut(state, player, ACCT.MEALS, cost, `${card.name} — donation`);
          player.hand.push({ id: "favor", type: "favor", name: "Favor" });
          return { type: "character", name: card.name, text: `donated ${w(cost)} — the Mayor owes you a Favor` };
        }
        return { type: "character", name: card.name, text: "couldn't spare a donation this time" };
      }
      return { type: "character", name: card.name, text: card.text ?? "" };
    }
    case "crew":
      return applyCrewEvent(state, player, card);
    case "theft": {
      // A rig is stolen: insured → pay the deductible and it's replaced; uninsured → written off.
      const owned = player.equipment.filter((e) => e.owned);
      if (!owned.length) return { type: "theft", name: card.name, text: "nothing worth stealing" };
      const eq = owned[0];
      const def = findEquipment(state.economy, eq.defId);
      const { borne, insured } = bearLoss(player, def.buy_cost);
      if (insured) {
        cashOut(state, player, ACCT.REPAIRS, borne, `${card.name} — deductible`);
        return { type: "theft", name: card.name, text: `${def.name} stolen but insured — ${w(borne)} deductible, replaced` };
      }
      player.equipment = player.equipment.filter((e) => e.id !== eq.id);
      post(state, player, `${card.name} — ${def.name} written off`, [
        { acct: ACCT.LEGAL, amt: def.buy_cost },
        { acct: ACCT.EQUIPMENT, amt: -def.buy_cost },
      ]);
      return { type: "theft", name: card.name, text: `${def.name} stolen — written off (${w(def.buy_cost)})` };
    }
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
