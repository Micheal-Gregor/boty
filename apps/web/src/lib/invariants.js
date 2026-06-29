// Dev-mode runtime invariant checks (see /TURN-FLOW.md). These run after each state update during REAL
// play and shout in the console — with expected-vs-actual — the moment something the spec forbids
// happens. So a multiplayer glitch announces itself (in Chrome AND Edge) instead of having to be
// reverse-engineered from behaviour. They are a NO-OP in a production build (import.meta.env.DEV gate).
//
// This is the "live listener" layer: test/flow.js + test/online.js cover the engine/protocol offline;
// this watches the running store, where the round-1 loop and the hot-reload desync actually showed up.

const DEV = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

let prevTurn = 0;
let lastRoundCardTurn = -1;
const warned = new Set(); // fire each distinct violation once per session so the console isn't spammed

function warn(key, msg) {
  if (warned.has(key)) return;
  warned.add(key);
  // eslint-disable-next-line no-console
  console.warn(`%c⚠ FLOW INVARIANT%c ${msg}`, "color:#e0b341;font-weight:bold", "color:inherit");
}

/** Called after every state push. `ctx = { state, popups, online }`. */
export function checkInvariants(ctx) {
  if (!DEV || !ctx?.state) return;
  const { state, popups } = ctx;

  // §2 — the round counter only ever moves forward. Backwards = a desync (the client should rebuild).
  if (state.turn < prevTurn) {
    warn(`turn-back:${prevTurn}->${state.turn}`, `round counter went BACKWARDS ${prevTurn} → ${state.turn} — desync? expected non-decreasing. (The store self-heals by rebuilding from the row.)`);
  }
  prevTurn = Math.max(prevTurn, state.turn);

  // §2 — a bankrupt player is never handed a turn.
  const ap = state.players?.[state.activePlayerIndex];
  if (!state.over && ap?.bankrupt) {
    warn(`active-bankrupt:${ap.id}:${state.turn}`, `active player "${ap.name}" is BANKRUPT but holds the turn — expected: skipped.`);
  }

  // S1/surfacing — the popup queue should be a handful, never a runaway (a runaway = a surfacing loop).
  const depth = popups?.length ?? 0;
  if (depth > 25) {
    warn(`popup-runaway:${depth}`, `popup queue is ${depth} deep — likely a surfacing LOOP. Expected a handful; a guard (round/draw/outcome) may be re-firing.`);
  }
}

/** Called when the round card is surfaced for `turn`. A repeat for the SAME round = the looping-card bug. */
export function noteRoundSurfaced(turn) {
  if (!DEV) return;
  if (turn === lastRoundCardTurn) {
    warn(`round-refire:${turn}`, `round card fired AGAIN for the SAME round (${turn}) — expected once per round (the looping-card bug). A rebuild/sync likely reset the guard.`);
  }
  lastRoundCardTurn = turn;
}
