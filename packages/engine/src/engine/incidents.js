// Building incidents (Build E) — "light civics". A drawn incident at a town building spawns one
// NPC-paid TENDER per trade it needs, handed to the player who runs that trade. The drawer is a
// mini-PM: coordinate it (every tender delivered) and take a small PM fee; let a contractor stall
// and you LOSE the fee and may sue the defaulter (the recipient-damages path from C). Lighter than a
// civic — no town-wide levy, just the PM's fee at stake. The contractors are paid by the building
// owner (NPC) either way, so this is the "community puts work on the table" stream.

import { createJob } from "../state/state.js";
import { cashIn, ACCT } from "../state/ledger.js";
import { w } from "./economy.js";
import { routeOrDefer } from "./routed.js";

/** The solvent player who runs a trade (prefer the PM/drawer when they match it). */
function tradePlayer(state, trade, pm) {
  if (pm && !pm.bankrupt && pm.service === trade) return pm;
  return state.players.find((p) => !p.bankrupt && p.service === trade) ?? null;
}

/** Resolve a building incident as a mini-PM contract. The PM plans one tender per trade (to the local
 *  who runs it, else the county), then routes-or-defers (a human PM picks; an AI decides inline). */
export function applyIncident(state, pm, card) {
  const fee = card.pm_fee ?? 3;
  const value = card.value ?? 6; // NPC-paid tender value per trade
  const deadline = card.deadline ?? 4;
  const portions = [];
  for (const trade of card.trades ?? []) {
    const taker = tradePlayer(state, trade, pm);
    if (!taker) portions.push({ trade, role: "county", choosable: false });
    else if (taker.id === pm.id) portions.push({ trade, role: "self", choosable: false }); // your own crew — no choice
    else portions.push({ trade, role: "tender", subId: taker.id, subName: taker.name, choosable: true });
  }
  const plan = {
    kind: "incident", actorId: pm.id, actorName: pm.name, cardId: card.id, cardName: card.name,
    fee, value, deadline, deadlineTurn: state.turn + deadline, portions,
    deferText: `🚧 ${card.name} — you're PM; choose who runs each tender`,
  };
  const r = routeOrDefer(state, plan, buildIncident);
  return { type: "incident", name: card.name, text: r.text, routing: r.routing ?? null };
}

/** Create the tenders for a planned incident. `choices[trade] === "bank"` declines that local tender
 *  (the county covers it — safe, denies the rival). Returns { type, name, text, routing }. */
export function buildIncident(state, plan, choices = {}) {
  const pm = state.players.find((p) => p.id === plan.actorId);
  if (!pm) return { type: "incident", name: plan.cardName, text: "", routing: null };
  state.incidents = state.incidents ?? [];
  state.incidentSeq = (state.incidentSeq ?? 0) + 1;
  const id = `IN${state.incidentSeq}`;
  const { fee, value, deadline, cardId, cardName } = plan;
  const contract = { id, pm_id: pm.id, name: cardName, fee, deadline_turn: state.turn + deadline, portions: [], failed: false };
  const notes = []; const parts = [];
  const toCounty = (trade, chosen) => {
    contract.portions.push({ trade, bank: true, done: true });
    notes.push(`${trade}→county`);
    parts.push({ trade, who: "The county", kind: "bank", value, note: chosen ? "you kept it off the locals" : "no local trade — county covers" });
  };
  const makeTender = (trade, taker, isSelf) => {
    const job = createJob({ id: `${cardId}_${trade}`, name: `${cardName} — ${trade}`, value, work_amount: value, deadline, terms: 1, min_tradesmen: 1, max_tradesmen: 1, required_equipment: null, droppable: false }, state.turn);
    job.incident_id = id;
    job.art = cardId; // tender shows the parent incident's art (e.g. grain_elevator), not a per-trade key
    taker.jobs.push(job);
    contract.portions.push({ trade, job_id: job.id, sub_id: taker.id, done: false });
    notes.push(`${trade}→${taker.name}`);
    parts.push({ trade, who: taker.name, isActor: isSelf, kind: "tender", value, note: isSelf ? "you run it (NPC-paid)" : "NPC-paid tender" });
  };
  for (const por of plan.portions) {
    const trade = por.trade;
    if (por.role === "self") makeTender(trade, pm, true);
    else if (por.role === "tender" && choices[trade] !== "bank") {
      const taker = state.players.find((p) => p.id === por.subId);
      if (taker && !taker.bankrupt) makeTender(trade, taker, false);
      else toCounty(trade, false);
    } else toCounty(trade, por.choosable);
  }
  state.incidents.push(contract);
  maybeCompleteIncident(state, contract);
  const routing = {
    kind: "incident",
    pm: pm.name,
    deadlineTurn: contract.deadline_turn,
    headline: `As PM, ${pm.name} takes a ${w(fee)} fee if every tender lands — let one stall and the fee is lost (sue the no-show).`,
    portions: parts,
  };
  return { type: "incident", name: cardName, routing, text: `🚧 ${cardName} — ${pm.name} coordinates (${notes.join(", ")}); ${w(fee)} PM fee if it all lands` };
}

/** A tender was delivered → mark it; pay the PM fee when the last one lands. */
export function onIncidentTenderComplete(state, job) {
  const c = (state.incidents ?? []).find((x) => x.id === job.incident_id);
  if (!c || c.failed) return;
  const p = c.portions.find((x) => x.job_id === job.id);
  if (p) p.done = true;
  maybeCompleteIncident(state, c);
}

function maybeCompleteIncident(state, c) {
  if (c.failed || !c.portions.every((p) => p.done)) return;
  const pm = state.players.find((p) => p.id === c.pm_id);
  if (pm && !pm.bankrupt) {
    cashIn(state, pm, ACCT.OTHER_INCOME, c.fee, `Incident PM fee (${c.id})`);
    state.log.push(`🚧 ${pm.name} coordinated the incident in full — takes a ${w(c.fee)} PM fee`);
  }
  state.incidents = state.incidents.filter((x) => x.id !== c.id);
}

/** A tender fell through → the PM loses the fee and may sue the defaulter (recovered, capped). */
export function onIncidentTenderBotch(state, contractor, job) {
  const c = (state.incidents ?? []).find((x) => x.id === job.incident_id);
  if (!c || c.failed) return null;
  c.failed = true;
  state.incidents = state.incidents.filter((x) => x.id !== c.id);
  const pm = state.players.find((p) => p.id === c.pm_id);
  if (pm && !pm.bankrupt && contractor && !contractor.bankrupt && contractor.id !== pm.id) {
    state.pendingDamages.push({ hirerId: pm.id, contractorId: contractor.id, jobId: `inc_${job.id}`, jobName: job.name, value: job.value, recipientId: pm.id });
    return `⚖️ ${pm.name} may sue ${contractor.name} for stalling ${job.name} (${w(job.value)} damages) — and loses the PM fee`;
  }
  return `🚧 ${pm?.name ?? "the coordinator"} loses the PM fee — ${job.name} fell through`;
}
