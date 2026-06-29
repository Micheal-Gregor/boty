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

/** Shared: a HUMAN actor with a real choice (≥1 local sub available) DEFERS to a routing modal; an
 *  AI actor (or a plan with no choices) is resolved inline and DETERMINISTICALLY — the AI denies a
 *  local sub who is ahead of it in cash (don't fund the front-runner), else shares the work. Inline
 *  resolution needs no extra recorded move, so replay stays exact. `state.humanIds` lists human seats. */
export function routeOrDefer(state, plan, builder) {
  state.pendingRouting = state.pendingRouting ?? [];
  const isHuman = (state.humanIds ?? []).includes(plan.actorId);
  if (isHuman && plan.portions.some((p) => p.choosable)) {
    state.pendingRouting.push(plan);
    return { text: plan.deferText, routing: null };
  }
  const actor = state.players.find((p) => p.id === plan.actorId);
  // AI: sacrifice your own markup to deny the FRONT-RUNNER (the richest player) — but only if you're
  // not the leader yourself; share with everyone else (routing locals earns the markup + keeps the
  // table in the game). Using the single leader (not "anyone richer than me") avoids over-denying off
  // a momentary post-upkeep cash dip.
  const leader = state.players.filter((p) => !p.bankrupt).sort((a, b) => b.cash - a.cash)[0];
  const choices = {};
  for (const por of plan.portions) {
    if (!por.choosable) continue;
    if (leader && actor && por.subId === leader.id && actor.id !== leader.id) choices[por.trade] = "bank";
  }
  return builder(state, plan, choices);
}

/** The drawer becomes GC of a 3-trade contract. Plan the portions, then route-or-defer. */
export function startRouted(state, gc, card) {
  const subVal = card.sub_value ?? 6;
  const markup = card.markup ?? 2; // per PLAYER portion (bank portions get none)
  const deadline = card.deadline ?? 4;
  const portions = [];
  for (const trade of card.required_trades ?? []) {
    if (gc.service === trade) { portions.push({ trade, role: "self", choosable: false }); continue; }
    const sub = pickSub(state, gc, trade);
    if (sub) portions.push({ trade, role: "sub", subId: sub.id, subName: sub.name, choosable: true });
    else portions.push({ trade, role: "bank", choosable: false });
  }
  const plan = {
    kind: "routed", actorId: gc.id, actorName: gc.name, cardId: card.id, cardName: card.name,
    subVal, markup, deadline, deadlineTurn: state.turn + deadline, portions,
    deferText: `🏗️ ${gc.name} takes ${card.name} as GC — choose who runs each trade`,
  };
  return routeOrDefer(state, plan, buildRouted);
}

/** Create the jobs/APs for a planned routed contract. `choices[trade] === "bank"` declines that local
 *  sub (the bank covers it — safe, no markup, denies the rival). Returns { text, routing }. */
export function buildRouted(state, plan, choices = {}) {
  const gc = state.players.find((p) => p.id === plan.actorId);
  if (!gc) return { text: "", routing: null };
  state.routed = state.routed ?? [];
  state.routedSeq = (state.routedSeq ?? 0) + 1;
  const id = `RT${state.routedSeq}`;
  const { subVal, markup, deadline, cardId, cardName } = plan;
  const contract = { id, gc_id: gc.id, deadline_turn: state.turn + deadline, client_value: 0, portions: [], failed: false };
  const notes = []; const parts = [];
  const toBank = (trade, chosen) => {
    contract.client_value += subVal;
    contract.portions.push({ trade, bank: true, done: true });
    notes.push(`${trade} → the bank`);
    parts.push({ trade, who: "The bank", kind: "bank", value: subVal, note: chosen ? "you kept it off the locals" : "no local trade — covered, no markup" });
  };
  for (const por of plan.portions) {
    const trade = por.trade;
    if (por.role === "self") {
      const job = createJob({ id: `${cardId}_self`, name: `${cardName} — ${trade} (your part)`, value: 0, work_amount: subVal, deadline, terms: 0, min_tradesmen: 1, max_tradesmen: 2, required_equipment: null, droppable: false }, state.turn);
      job.routed_id = id;
      job.art = cardId; // show the parent contract's art (e.g. rt_townhall), not a per-trade key
      gc.jobs.push(job);
      contract.portions.push({ trade, job_id: job.id, self: true, done: false });
      contract.client_value += subVal + markup;
      notes.push(`you take ${trade}`);
      parts.push({ trade, who: gc.name, isActor: true, kind: "self", value: subVal + markup, note: "your own crew" });
    } else if (por.role === "sub" && choices[trade] !== "bank") {
      const sub = state.players.find((p) => p.id === por.subId);
      if (sub && !sub.bankrupt) {
        const job = createJob({ id: `${cardId}_${trade}`, name: `${cardName} — ${trade} sub`, value: subVal, work_amount: subVal, deadline, terms: PORTION_TERMS, min_tradesmen: 1, max_tradesmen: 2, required_equipment: null, droppable: false }, state.turn);
        job.routed_id = id;
        job.art = cardId; // show the parent contract's art (e.g. rt_townhall), not a per-trade key
        job.hirer_id = gc.id;
        sub.jobs.push(job);
        gc.payables.push(createPayable({ vendor: `${sub.name} — ${cardName} (${trade})`, amount: subVal, dueTurn: null, isNpc: false, creditorId: sub.id, jobId: job.id, pending: true }));
        contract.portions.push({ trade, job_id: job.id, sub_id: sub.id, done: false });
        contract.client_value += subVal + markup;
        notes.push(`${trade} → ${sub.name}`);
        parts.push({ trade, who: sub.name, kind: "sub", value: subVal, note: "you owe, net-30 on delivery" });
      } else toBank(trade, false); // the sub vanished between draw and decision → bank covers it
    } else {
      toBank(trade, por.choosable); // a forced bank portion, or a sub you declined
    }
  }
  state.routed.push(contract);
  maybeCompleteRouted(state, contract); // an all-bank contract settles at once
  const routing = {
    kind: "routed",
    gc: gc.name,
    deadlineTurn: contract.deadline_turn,
    headline: `Bills ${w(contract.client_value)} (net-90) once every portion lands — miss one and the whole contract collapses.`,
    portions: parts,
  };
  return { text: `🏗️ ${gc.name} takes ${cardName} as GC — ${notes.join(", ")}; bills ${w(contract.client_value)} net-90 when it all lands`, routing };
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
