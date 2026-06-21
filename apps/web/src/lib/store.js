// The game controller — a thin seam between the Svelte UI and the engine. For M2 it runs the
// engine locally in the browser (LocalTransport); later a RemoteTransport will send the same
// intents to Supabase, and the UI won't change. AI seats are driven by the engine's own bots.

import { writable } from "svelte/store";
import { Game } from "@boty/engine";
import { botActions } from "@boty/engine/bots";
import { loadContent } from "./content.js";

const { economy, decks, flavor } = loadContent();
const AI_DELAY = 650; // ms between AI seats, so you can watch the table move
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** UI state. `view` is a fresh plain-data snapshot of the engine state on every change — the
 * engine mutates its objects in place, so the UI must read a new-reference snapshot or Svelte
 * won't see the change. `rev` bumps on every change. */
export const ui = writable({
  screen: "setup", game: null, view: null, ctx: null, flavor, economy, error: null, rev: 0,
  aiActing: null, threat: null, picking: null, reckoning: null, final: null, court: null,
});

let game = null;
let ai = {}; // playerId -> strategy string, or null for a human seat

/** Deep-copy the UI-relevant slice of engine state into plain data (new references). */
function viewOf() {
  if (!game) return null;
  const s = game.state;
  return {
    turn: s.turn, activePlayerIndex: s.activePlayerIndex, over: s.over, phase: s.phase,
    log: s.log.slice(-8),
    players: s.players.map((p) => ({
      id: p.id, name: p.name, service: p.service, cash: p.cash, bankrupt: p.bankrupt, building: p.building,
      tradesmen: p.tradesmen.map((t) => ({ ...t })),
      equipment: p.equipment.map((e) => ({ ...e })),
      jobs: p.jobs.map((j) => ({ ...j, assigned_tradesmen: [...j.assigned_tradesmen] })),
      invoices: p.invoices.map((i) => ({ ...i })),
      payables: p.payables.map((a) => ({ ...a })),
      hand: p.hand.map((c) => ({ ...c })),
    })),
  };
}

function push(patch = {}) {
  ui.update((v) => ({ ...v, game, view: viewOf(), rev: v.rev + 1, ...patch }));
}
function fail(msg) { ui.update((v) => ({ ...v, rev: v.rev + 1, error: msg })); }

export const services = economy.services;
export const isAI = (playerId) => !!ai[playerId];
const player = (id) => game.state.players.find((p) => p.id === id);
const handHas = (p, type) => p.hand.some((c) => c.type === type);

/** Start a new game. seats: [{ name, service, strategy|null }]. */
export function newGame(seats) {
  game = new Game(economy, seats.map((s) => ({ name: s.name, service: s.service })), {
    ...decks,
    seed: (Math.random() * 2 ** 32) >>> 0,
  });
  game.state.flavor = flavor;
  ai = {};
  game.state.players.forEach((p, i) => { ai[p.id] = seats[i].strategy ?? null; });
  const ctx = game.start();
  push({ screen: "board", ctx, error: null, aiActing: null, threat: null, picking: null, reckoning: null, final: null, court: null });
  advanceUntilHuman(ctx);
}

/** Run an engine action for the current (human) player, catching illegal moves. */
export function act(fn) {
  try { fn(game); push({ error: null }); }
  catch (e) { fail(e?.message ?? String(e)); }
}

// --- Threats (Sabotage / Sue) + the response window --------------------------------------

export function startPick(type) { push({ picking: type, error: null }); }
export function cancelPick() { push({ picking: null }); }

export function playSabotage(jobId) {
  push({ picking: null });
  try { game.playSabotage(jobId); } catch (e) { return fail(e?.message ?? String(e)); }
  resolveThreat();
}

export function playSue(debtorId, payableId, slick = false) {
  push({ picking: null });
  try { game.sue(debtorId, payableId, { slick }); } catch (e) { return fail(e?.message ?? String(e)); }
  resolveThreat();
}

/** If the threatened player is AI, auto-respond; otherwise surface a modal for the human. */
function resolveThreat() {
  const t = game.state.pendingThreat;
  if (!t) return push({ error: null });
  const targetId = t.type === "sabotage" ? t.ownerId : t.debtorId;
  if (ai[targetId]) { aiRespond(t); push({ error: null, threat: null }); afterAct(); }
  else push({ error: null, threat: viewThreat(t) });
}

function aiRespond(t) {
  const target = player(t.type === "sabotage" ? t.ownerId : t.debtorId);
  if (t.type === "sabotage") {
    game.respondToThreat({ counter: handHas(target, "rush") }); // AI always rushes if it can
  } else {
    const canFight = target.cash >= economy.civil.deposit;
    game.respondToThreat({ contest: canFight, ownLawyer: handHas(target, "slick_lawyer") });
  }
}

/** The human target responds via the modal. */
export function respond(decision) {
  try { game.respondToThreat(decision); } catch (e) { return fail(e?.message ?? String(e)); }
  push({ threat: null, error: null });
  afterAct();
}

function viewThreat(t) {
  if (t.type === "sabotage") {
    const owner = player(t.ownerId);
    const job = owner.jobs.find((j) => j.id === t.jobId);
    return { type: "sabotage", targetName: owner.name, jobName: job?.name ?? t.jobId, canCounter: handHas(owner, "rush") };
  }
  const debtor = player(t.debtorId);
  const ap = debtor.payables.find((a) => a.id === t.payableId);
  return { type: "sue", targetName: debtor.name, amount: ap?.amount, canLawyer: handHas(debtor, "slick_lawyer") };
}

/** After any action that might end a player's options (here: just refresh / continue). */
function afterAct() {
  if (game.state.over) return; // shouldn't be here mid-turn
}

// --- Turn flow ---------------------------------------------------------------------------

export function endTurn() {
  if (game.state.pendingCourt.length) return fail("Resolve your court case first");
  if (game.state.pendingThreat) return fail("Resolve the response window first");
  const ctx = game.endTurn();
  if (ctx.reckoning) return enterReckoning(ctx.order);
  if (ctx.over) return push({ screen: "gala", ctx, final: ctx });
  advanceUntilHuman(ctx);
}

/** A failed Demand Roll summons you to court. AI seats auto-defend; a human gets the modal. */
export function resolveCourtUI(payableId, lawyer) {
  try { game.resolveCourt(payableId, { lawyer }); } catch (e) { return fail(e?.message ?? String(e)); }
  push({ court: game.courtCases.length ? [...game.courtCases] : null });
}

/** Step through AI seats (auto-resolving their court + acting) until a human is up. */
async function advanceUntilHuman(initialCtx) {
  let lastCtx = initialCtx;
  while (!game.state.over) {
    const p = game.currentPlayer;
    if (!ai[p.id]) break; // human is up
    push({ aiActing: p.name, court: null });
    await sleep(AI_DELAY);
    if (game.courtCases.length) game.autoResolveCourt();
    try { botActions(game, ai[p.id]); } catch { /* best effort */ }
    const ctx = game.endTurn();
    if (ctx.reckoning) { push({ aiActing: null }); return enterReckoning(ctx.order); }
    if (ctx.over) return push({ aiActing: null, screen: "gala", ctx, final: ctx });
    lastCtx = ctx;
  }
  if (game.state.over) return;
  push({ aiActing: null, ctx: lastCtx, error: null, court: game.courtCases.length ? [...game.courtCases] : null });
}

// --- The Final Reckoning (Last Licks) ----------------------------------------------------

let reckon = null; // { order, idx }

function enterReckoning(order) {
  reckon = { order, idx: -1 };
  push({ screen: "reckoning", reckoning: reckon, aiActing: null });
  advanceSeat();
}

function advanceSeat() {
  reckon.idx += 1;
  if (reckon.idx >= reckon.order.length) {
    const final = game.closeBooks();
    reckon = null;
    return push({ screen: "gala", final, reckoning: null });
  }
  const id = reckon.order[reckon.idx];
  game.seatReckoning(id);
  if (ai[id]) return advanceSeat(); // AI seats take no last licks (bots don't litigate)
  push({ reckoning: { ...reckon } }); // human seat: render the reckoning screen
}

export function reckoningDone() {
  if (game.state.pendingThreat) return fail("Resolve the response window first");
  advanceSeat();
}

export function restart() {
  game = null;
  push({ screen: "setup", ctx: null, final: null, threat: null, picking: null, reckoning: null, aiActing: null, error: null, court: null });
}

// Dev-only debug hook for manual/automated testing in the browser console.
if (typeof window !== "undefined" && import.meta.env?.DEV) {
  window.__boty = { ui, getGame: () => game, refresh: () => push({}) };
}
