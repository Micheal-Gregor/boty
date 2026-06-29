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
import { bearLoss, marketingInjection, hasModifier } from "./modifiers.js";
import { applyCrewEvent } from "./crew.js";
import { applyIncident } from "./incidents.js";
import { startRouted } from "./routed.js";
import { startProject } from "./projects.js";
import { startCivic } from "./civics.js";
import { performanceReview } from "./employment.js";
import { applyGlobal } from "./globals.js";
import { resolveCivilEvent, incurPayable } from "./payables.js";
import { releaseTradesman } from "./jobs.js";
import { seasonName } from "./season.js";

/**
 * Cash impact of a card, including the count-scaling terms that tie value to your build:
 * `per_equipment` (rewards/penalises owning gear — the patent lever) and `per_tradesman`
 * (rewards/penalises headcount — the profit-share lever). These are the structural levers
 * that make the equipment-vs-hire opening a real choice (Dial 3).
 */
function cashEffect(state, player, card) {
  let amount = card.cash ?? 0;
  if (card.per_equipment) amount += card.per_equipment * player.equipment.length;
  if (card.per_tradesman) amount += card.per_tradesman * player.tradesmen.length;
  // Difficulty floor lever: scale HITS (negative cash) by the tier's shock multiplier — softer on
  // Steady, sharper on Cutthroat. Gains are untouched.
  if (amount < 0) {
    const tiers = state.economy?.difficulty_tiers ?? {};
    const mult = tiers[state.difficulty ?? state.economy?.difficulty ?? "standard"]?.shock_mult ?? 1;
    amount = Math.round(amount * mult);
  }
  return amount;
}

// Weather/storms cost a lost day of WORK, not cash — they undo progress on the jobs underway
// (spread across active jobs, floored at 0). Returns how much work was actually undone.
// Shave progress off active jobs. mode "all" = every active job loses `amount` (a storm hits every
// crew); mode "top" = only your most-progressed job takes it (a broken rig stalls one big push).
// Deterministic (no RNG) → lockstep-safe. Returns the TOTAL work lost (for the feed line).
function workSetback(player, amount, mode = "all") {
  const active = (player.jobs ?? []).filter((j) => j.state === "Active" && j.work_done > 0);
  let lost = 0;
  if (mode === "top") {
    const job = active.sort((a, b) => b.work_done - a.work_done)[0];
    if (job) { const cut = Math.min(job.work_done, amount); job.work_done -= cut; lost += cut; }
  } else {
    for (const job of active) { const cut = Math.min(job.work_done, amount); job.work_done -= cut; lost += cut; }
  }
  return lost;
}

function cashLine(card, amount) {
  const detail = [
    card.per_equipment ? `${card.per_equipment > 0 ? "+" : ""}${card.per_equipment} W/equipment` : null,
    card.per_tradesman ? `${card.per_tradesman > 0 ? "+" : ""}${card.per_tradesman} W/employee` : null,
  ].filter(Boolean).join(", ");
  const sign = amount >= 0 ? "💰 +" : "⚡ −"; // explicit minus so a hit reads "⚡ −3 W", never an ambiguous "3 W"
  return `${sign}${w(Math.abs(amount))}${detail ? ` (${detail})` : ""}`;
}

/** Phase 2 — draw `count` Fortune cards for the player and resolve each. Returns summaries. */
export function drawFortune(state, player, count) {
  const deck = player.deck ?? state.deck; // per-player deck (Stage: living deck)
  const season = seasonName(state);
  // Season-gated cards (heat wave → Summer, ice storm → Winter, …) only surface in their season.
  // Bench any that come up out of season and put them back, so they wait for the right time of year.
  const cards = [], benched = [];
  let guard = 0;
  while (cards.length < count && guard++ < 300) {
    const c = deck.drawN(1)[0];
    if (!c) break;
    if (c.season && c.season !== season) { benched.push(c); continue; }
    cards.push(c);
  }
  if (benched.length) deck.returnToPile(benched); // back into the PILE for their season — NOT inject (which would duplicate into source and inflate the deck)
  const injected = marketingInjection(player); // marketing brings in extra work
  if (injected) cards.unshift(injected);
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

// NPC jobs — the word-of-mouth cast. Per-trade skin (the work) + a label.
const NPC_LABEL = { hettrick: "Old Man Hettrick", lundgren: "Mrs. Lundgren", dot: "Dot", boon: "Chief Boon" };
// Each trade gets its own work (the job name) AND its own flavor line — so a plumber and a welder
// drawing "Dot" see entirely different jobs, not the same quote with a swapped noun.
const NPC_JOB_SKINS = {
  hettrick: {
    "mechanic":        { job: "his old truck — again",     flavor: "Old Man Hettrick’s ancient truck has broken down. Again. “Just a quick look,” he says. It never is. Net 90, his terms." },
    "plumber":         { job: "his busted radiator",       flavor: "Hettrick’s radiator’s gone stone cold. He wants it fixed with parts off the shelf and pays slow — net 90." },
    "electrician":     { job: "his shorting wiring",       flavor: "The wiring in Hettrick’s walls is flickering and shorting. “It’s just temperamental.” It’s a fire waiting to happen — net 90." },
    "pipefitter":      { job: "his broken furnace",        flavor: "Hettrick’s furnace has quit and he’d rather wear two coats than pay quick. Net 90 — his terms, always." },
    "welder":          { job: "his broken gate",           flavor: "The gate on Hettrick’s fence is hanging off its post. “A little weld, that’s all” — he’s haggling before you’ve looked." },
    "HVAC technician": { job: "his dead window unit",      flavor: "Hettrick’s window air conditioner has died. “It still rattles, so it works.” It does not. He pays net 90." },
  },
  lundgren: {
    "mechanic":        { job: "her car that won’t start",  flavor: "Mrs. Lundgren’s old car won’t turn over. She’s baked you something and apologizes for the fuss — net 90, when she can." },
    "plumber":         { job: "her scalding water tank",   flavor: "Mrs. Lundgren’s water tank runs far too hot — she nearly scalded herself. Bring it down to safe; she’ll square up by and by." },
    "electrician":     { job: "her flickering wiring",     flavor: "The wiring in Mrs. Lundgren’s old home is flickering and shorting. “I don’t want to be a bother, dear” — but it needs doing before it’s dangerous." },
    "pipefitter":      { job: "her cold bedroom radiator", flavor: "The radiator in Mrs. Lundgren’s bedroom won’t get warm and the nights are turning cold — get her cozy before the frost." },
    "welder":          { job: "her back-yard shed door",   flavor: "The shed door in Mrs. Lundgren’s back yard is off its hinges. A weld or two and it’s good for another decade." },
    "HVAC technician": { job: "her too-cold AC",           flavor: "Mrs. Lundgren’s window air conditioner is freezing her out. “I’m sure it’s fine, dear.” Set it right — gently." },
  },
  dot: {
    "mechanic":        { job: "the diner delivery truck",  flavor: "Dot’s delivery truck won’t start and the day’s supplies are stranded at the depot — get it running and Dot spreads the word." },
    "plumber":         { job: "the flooded storefront",    flavor: "Dot’s storefront has flooded — pump it out and find the leak before the health inspector catches wind of it." },
    "electrician":     { job: "the breakfast blackout",    flavor: "The power’s out at Dot’s right in the middle of breakfast and the grill’s gone cold — get the lights back before she loses the rush." },
    "pipefitter":      { job: "the kitchen steam table",   flavor: "No steam means no hot plates and no blue-plate special — Dot needs the steam table fixed before the lunch crowd." },
    "welder":          { job: "the diner’s chairs & tables", flavor: "Dot’s metal chairs and tables have gone wobbly and loose — tack them solid before a regular ends up on the floor." },
    "HVAC technician": { job: "the broken cooler",         flavor: "Dot’s walk-in cooler has packed it in and a week of food is warming up — get it cold again before it all spoils." },
  },
  boon: {
    "mechanic":        { job: "a crash-car inspection",    flavor: "A wreck got towed into your shop — Chief Boon needs it inspected for the accident report before it’s released." },
    "plumber":         { job: "Dot’s Diner flood response", flavor: "Dot’s Diner has flooded and Chief Boon’s running the response — he needs a plumber on site to stop the water." },
    "electrician":     { job: "the fire-station alarm",    flavor: "The alarm system at the fire station is down — Chief Boon needs it wired back to life before the next call comes in." },
    "pipefitter":      { job: "the school sprinkler reset", flavor: "After an incident at the elementary school, the sprinkler system has to be reset and recertified — Chief Boon needs it now." },
    "welder":          { job: "the fire-truck ladder",     flavor: "The ladder on the fire truck has a cracked weld — Chief Boon can’t put the rig back in service until it’s fixed." },
    "HVAC technician": { job: "the fire-station HVAC",     flavor: "The firehouse HVAC has quit and the bays are stifling — Chief Boon needs the crew comfortable and ready to roll." },
  },
};

/** Skin an NPC job to the drawer's trade: their work + stats + the word-of-mouth tag + art key. */
function tailorNpcJob(economy, card, trade) {
  const cfg = economy.npc_jobs?.[card.npc];
  if (!cfg) return card;
  const skin = (NPC_JOB_SKINS[card.npc] ?? {})[trade] ?? { job: "a job", flavor: card.flavor };
  return {
    ...card,
    name: `${NPC_LABEL[card.npc] ?? card.npc} — ${skin.job}`,
    flavor: skin.flavor ?? card.flavor,
    value: cfg.value, work_amount: cfg.work, deadline: cfg.deadline, terms: cfg.terms,
    min_tradesmen: 1, max_tradesmen: cfg.crew,
    required_equipment: null, equipment_per_tradesman: false, required_building_tier: 1,
    required_trade: null,
    droppable: card.npc !== "boon", // Chief Boon's job is mandatory — can't be dropped
    npc: card.npc,
    art: `job/${card.npc}/${tradeSlug(trade)}`,
  };
}

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

export function resolveCard(state, player, card) {
  switch (card.type) {
    case "job": {
      // The tailored ladder: a generic j1–j6 card skins to the drawer's trade (always their own
      // job — no routing), so every trade sees the identical work. JOB-CARDS-PLAN Part B1.
      const drawn = card.npc ? tailorNpcJob(state.economy, card, player.service)
        : card.size ? tailorJob(state.economy, card, player.service)
        : card;
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
      return { type: "job", name: drawn.name, job, art: drawn.art ?? null, flavor: drawn.flavor ?? null, text: `new job ${job.id} (${w(job.value)}, due turn ${job.deadline_turn})` };
    }
    case "windfall":
    case "shock": {
      if (card.work) { // a setback that costs WORK, not cash (weather, a broken rig, …)
        const icon = card.icon ?? "⛈️";
        const lost = workSetback(player, card.work, card.work_hits ?? "all"); // weather → all crews; equipment → your biggest push
        const text = lost > 0 ? `${icon} −${lost} work` : `${icon} a wash — no work underway to lose`;
        return { type: card.type, name: card.name, work: -lost, text };
      }
      const amount = cashEffect(state, player, card);
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
      for (const e of player.equipment) if (e.assigned_to === retiree.id) e.assigned_to = null; // free their tool — else it looks taken by a ghost
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
    case "routed": {
      const r = startRouted(state, player, card);
      return { type: "routed", name: card.name, text: r.text, routing: r.routing };
    }
    case "project":
      return { type: "project", name: card.name, text: startProject(state, player, card) };
    case "civic": {
      // The storm civic follows the season; the rest are keyed by their id.
      const art = card.seasonal_storm ? `civic/storm/${seasonName(state).toLowerCase()}` : (card.art ?? `civic/${card.id}`);
      return { type: "civic", name: card.name, art, text: startCivic(state, player, { ...card, art }) };
    }
    case "referral": {
      // The wild card: a job that isn't your trade. Broker it to a shop that can do it for a
      // finder's fee (= the job's sell price); they accept next round or refuse. No shop with that
      // trade at the table → the county handles it and you still pocket the fee.
      const others = state.economy.services.filter((s) => s !== player.service);
      let roll; do { roll = state.die(); } while (roll > others.length); // reroll a 6 → uniform over the 5 trades (no mod-6 bias toward services[0])
      const trade = others[roll - 1];
      const job = createJob(tailorJob(state.economy, { ...card, droppable: true }, trade), state.turn);
      const fee = Math.max(1, Math.floor(job.value * state.economy.sell_rate));
      const contractor = pickContractor(state, player, trade);
      if (!contractor) {
        cashIn(state, player, ACCT.OTHER_INCOME, fee, `Referral fee — no ${trade} in town`);
        return { type: "referral", name: `Referral: a ${trade} job`, art: "job/walkin/2p", text: `not your trade, and no ${trade} at the table — the county takes it; you pocket the ${w(fee)} finder's fee` };
      }
      state.pendingReferral.push({ id: `REF${state.refSeq = (state.refSeq || 0) + 1}`, referrer_id: player.id, contractor_id: contractor.id, fee, job, trade });
      return { type: "referral", name: `Referral: a ${trade} job`, art: "job/walkin/2p", routedTo: contractor.id, text: `not your trade — offered to ${contractor.name}; a ${w(fee)} finder's fee if they take it` };
    }
    case "crew":
      return applyCrewEvent(state, player, card);
    case "theft": {
      // A rig is stolen: insured → pay the deductible and it's replaced; uninsured → written off.
      const owned = player.equipment.filter((e) => e.owned);
      if (!owned.length) return { type: "theft", name: card.name, text: "nothing worth stealing" };
      // Private security may PREVENT the theft outright — no loss, no inside-job, no escalation.
      if (hasModifier(player, "private_security") && state.die() <= (state.economy.security?.prevent ?? 0)) {
        return { type: "theft", name: card.name, text: `🛡️ ${player.name}'s private security catches the thief in the act — nothing taken` };
      }
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
      // A trade-specific violation is in a RANDOM system each time (electrical / plumbing / etc.) —
      // randomise which trade fixes it so no one trade is quietly buffed, and the fix routes out to
      // whoever holds that trade (forcing players to do business). General write-ups stay open to anyone.
      const services = state.economy.services ?? [];
      const fixTrade = card.fix_trade && services.length ? services[(state.die() - 1) % services.length] : (card.fix_trade ?? null);
      const defect = createDefect({ ...card, fix_trade: fixTrade }, state.turn);
      player.defects.push(defect);
      const route = fixTrade ? ` (a ${fixTrade} fixes it)` : "";
      return { type: "defect", name: card.name, defect, text: `🚧 code violation: −${defect.productivity_hit} output and ${w(defect.fine)}/turn until you fix it for ${w(defect.fix_cost)}${route}` };
    }
    case "payable": {
      const ap = incurPayable(state, player, { vendor: card.name, amount: card.amount, dueTurn: state.turn + (card.due ?? 3), isNpc: true, memo: `${card.name} — vendor bill`, debits: [{ acct: ACCT.COGS_MATERIALS, amt: card.amount }] });
      return { type: "payable", name: card.name, text: `🧾 vendor bill ${ap.id}: ${w(ap.amount)} (Dr Materials / Cr AP) due turn ${ap.due_turn}` };
    }
    case "summons": {
      const event = state.civilEventDeck.draw();
      if (!event) return { type: "summons", name: card.name, text: "courthouse closed (no event)" };
      const lines = resolveCivilEvent(state, player, event);
      // The drawn civil event reveals as its OWN card afterward (its own art at card/<event.id>, name,
      // flavor) — so the courthouse card never looks like it IS a lawsuit/pageant. The courthouse card
      // just sets the scene; the docket item carries the outcome.
      return {
        type: "summons", name: card.name, event: event.name,
        text: "📋 A name is called — a civil matter goes on the docket.",
        drawnCard: { cardId: event.id, name: event.name, flavor: event.flavor ?? null, text: lines.join("; ") },
      };
    }
    default:
      return { type: card.type ?? "unknown", name: card.name ?? "?", text: "(unhandled card type)" };
  }
}
