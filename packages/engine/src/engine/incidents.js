// Building incidents (Build E) — "light civics". A drawn incident at a town building spawns one
// NPC-paid TENDER per trade it needs, handed to the player who runs that trade. The drawer is a
// mini-PM: coordinate it (every tender delivered) and take a small PM fee; let a contractor stall
// and you LOSE the fee and may sue the defaulter (the recipient-damages path from C). Lighter than a
// civic — no town-wide levy, just the PM's fee at stake. The contractors are paid by the building
// owner (NPC) either way, so this is the "community puts work on the table" stream.

import { createJob } from "../state/state.js";
import { cashIn, ACCT } from "../state/ledger.js";
import { w } from "./economy.js";

/** The solvent player who runs a trade (prefer the PM/drawer when they match it). */
function tradePlayer(state, trade, pm) {
  if (pm && !pm.bankrupt && pm.service === trade) return pm;
  return state.players.find((p) => !p.bankrupt && p.service === trade) ?? null;
}

/** Resolve a building incident as a mini-PM contract. Returns a Fortune-feed summary. */
export function applyIncident(state, pm, card) {
  state.incidents = state.incidents ?? [];
  state.incidentSeq = (state.incidentSeq ?? 0) + 1;
  const id = `IN${state.incidentSeq}`;
  const fee = card.pm_fee ?? 3;
  const value = card.value ?? 6; // NPC-paid tender value per trade
  const deadline = card.deadline ?? 4;
  const contract = { id, pm_id: pm.id, fee, deadline_turn: state.turn + deadline, portions: [], failed: false };
  const notes = [];
  const parts = []; // structured allocation for the "contract routed" popup
  for (const trade of card.trades ?? []) {
    const taker = tradePlayer(state, trade, pm);
    if (taker) {
      const job = createJob({ id: `${card.id}_${trade}`, name: `${card.name} — ${trade}`, value, work_amount: value, deadline, terms: 1, min_tradesmen: 1, max_tradesmen: 1, required_equipment: null, droppable: false }, state.turn);
      job.incident_id = id;
      taker.jobs.push(job);
      contract.portions.push({ trade, job_id: job.id, sub_id: taker.id, done: false });
      notes.push(`${trade}→${taker.name}`);
      parts.push({ trade, who: taker.name, isActor: taker.id === pm.id, kind: "tender", value, note: taker.id === pm.id ? "you run it (NPC-paid)" : "NPC-paid tender" });
    } else {
      contract.portions.push({ trade, bank: true, done: true }); // no local trade → the county covers it
      notes.push(`${trade}→county`);
      parts.push({ trade, who: "The county", kind: "bank", value, note: "no local trade — county covers" });
    }
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
  return { type: "incident", name: card.name, routing, text: `🚧 ${card.name} — ${pm.name} coordinates (${notes.join(", ")}); ${w(fee)} PM fee if it all lands` };
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
