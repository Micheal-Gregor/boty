// Routed jobs (Build A) — the general-contractor squeeze. The drawer takes a 3-trade CLIENT
// contract: they do any portion whose trade they hold, ROUTE the rest to the trade-player as a
// sub-job they OWE (sub_value, net-30 from delivery), and bill the client ONE invoice (base +
// markup, net-90) that lands ONLY when every portion is delivered. Miss a portion → the whole
// contract collapses: no client AR, the delivered subs are still owed, and the GC sues the no-show
// (the existing botchRoutedJob queues the damages for a routed/hirer portion).
//
// Reuses the routed sub-job machinery (hirer_id → completeJob makes the GC's AP due). The NEW part
// is the contract: ONE net-90 client invoice on all-complete, and commission-follows-players — a
// portion the bank has to cover (no local trade) loses its markup.

import { createJob, createPayable, createInvoice } from "../state/state.js";
import { accrue, ACCT } from "../state/ledger.js";
import { w } from "./economy.js";

const PORTION_TERMS = 1; // sub AP: net-30 from delivery
const CLIENT_TERMS = 3;  // client AR: net-90 from completion

/** A solvent rival who runs `trade` with spare routed capacity (one routed job per crew member). */
function pickSub(state, gc, trade) {
  return state.players.find(
    (p) => p !== gc && !p.bankrupt && p.service === trade &&
      p.jobs.filter((j) => j.hirer_id != null).length < Math.max(1, p.tradesmen.length),
  ) ?? null;
}

/** The drawer becomes GC of a 3-trade contract. Returns the feed line. */
export function startRouted(state, gc, card) {
  state.routed = state.routed ?? [];
  state.routedSeq = (state.routedSeq ?? 0) + 1;
  const id = `RT${state.routedSeq}`;
  const subVal = card.sub_value ?? 6;
  const markup = card.markup ?? 2; // per PLAYER portion (bank portions get none)
  const deadline = card.deadline ?? 4;
  const contract = { id, gc_id: gc.id, deadline_turn: state.turn + deadline, client_value: 0, portions: [], failed: false };
  const notes = [];
  for (const trade of card.required_trades ?? []) {
    if (gc.service === trade) {
      // GC does this portion — their own job, no AP, base+markup is theirs.
      const job = createJob({ id: `${card.id}_self`, name: `${card.name} — ${trade} (your part)`, value: 0, work_amount: subVal, deadline, terms: 0, min_tradesmen: 1, max_tradesmen: 2, required_equipment: null, droppable: false }, state.turn);
      job.routed_id = id;
      gc.jobs.push(job);
      contract.portions.push({ trade, job_id: job.id, self: true, done: false });
      contract.client_value += subVal + markup;
      notes.push(`you take ${trade}`);
      continue;
    }
    const sub = pickSub(state, gc, trade);
    if (sub) {
      const job = createJob({ id: `${card.id}_${trade}`, name: `${card.name} — ${trade} sub`, value: subVal, work_amount: subVal, deadline, terms: PORTION_TERMS, min_tradesmen: 1, max_tradesmen: 2, required_equipment: null, droppable: false }, state.turn);
      job.routed_id = id;
      job.hirer_id = gc.id;
      sub.jobs.push(job);
      gc.payables.push(createPayable({ vendor: `${sub.name} — ${card.name} (${trade})`, amount: subVal, dueTurn: null, isNpc: false, creditorId: sub.id, jobId: job.id, pending: true }));
      contract.portions.push({ trade, job_id: job.id, sub_id: sub.id, done: false });
      contract.client_value += subVal + markup;
      notes.push(`${trade} → ${sub.name}`);
    } else {
      // No local trade → the bank covers it: base value only (no markup), counts done now.
      contract.client_value += subVal;
      contract.portions.push({ trade, bank: true, done: true });
      notes.push(`${trade} → the bank`);
    }
  }
  state.routed.push(contract);
  maybeCompleteRouted(state, contract); // an all-bank contract settles at once
  return `🏗️ ${gc.name} takes ${card.name} as GC — ${notes.join(", ")}; bills ${w(contract.client_value)} net-90 when it all lands`;
}

/** A routed portion was delivered → mark it; bill the client when the last one lands. */
export function onRoutedPortionComplete(state, job) {
  const c = (state.routed ?? []).find((x) => x.id === job.routed_id);
  if (!c || c.failed) return;
  const p = c.portions.find((x) => x.job_id === job.id);
  if (p) p.done = true;
  maybeCompleteRouted(state, c);
}

function maybeCompleteRouted(state, c) {
  if (c.failed || !c.portions.every((p) => p.done)) return;
  const gc = state.players.find((p) => p.id === c.gc_id);
  if (gc) {
    gc.invoices.push(createInvoice({ id: c.id, value: c.client_value }, state.turn, CLIENT_TERMS));
    accrue(state, gc, ACCT.AR, ACCT.REVENUE, c.client_value, `GC contract delivered (${c.id})`);
    state.log.push(`🏗️ ${gc.name}'s GC contract delivered in full — bills ${w(c.client_value)} (net-90)`);
  }
  state.routed = state.routed.filter((x) => x.id !== c.id);
}

/** A routed portion fell through → the whole contract collapses: no client AR; delivered subs stay
 *  owed; a routed (hirer) portion's damages suit is queued separately by botchRoutedJob. */
export function onRoutedPortionBotch(state, job) {
  const c = (state.routed ?? []).find((x) => x.id === job.routed_id);
  if (!c || c.failed) return;
  c.failed = true;
  state.routed = state.routed.filter((x) => x.id !== c.id);
  const gc = state.players.find((p) => p.id === c.gc_id);
  state.log.push(`✗ ${gc?.name ?? "the GC"}'s GC contract collapsed — a portion fell through; no client payment`);
}
