// Global (town-wide) effects — the GLOBAL CARD layer. Unlike a player modifier, a global effect
// grips the whole table at once: a levy every shop pays, a boom/recession that moves every job's
// pay. They're introduced by civic ("political") jobs — finish one and the Mayor owes favours all
// round; let one collapse and the whole town foots an austerity bill.
//
// One shared list lives on the state (state.globalEffects). Timers tick once PER ROUND (in advance,
// when the round wraps); the per-turn bite (the levy) is charged in each player's upkeep.

import { w } from "./economy.js";
import { cashOut, ACCT } from "../state/ledger.js";

let counter = 0;
export function resetGlobals() { counter = 0; }

function describe(e) {
  if (e.kind === "levy") return `every shop pays a ${w(e.magnitude)}/turn levy`;
  if (e.kind === "boom") return `new jobs pay +${Math.round(e.magnitude * 100)}%`;
  if (e.kind === "recession") return `new jobs pay −${Math.round(e.magnitude * 100)}%`;
  return "a town-wide effect";
}

/** Drop a global effect on the whole town. Returns the announcement line. */
export function applyGlobal(state, spec, sourceName) {
  const effect = { id: `G${++counter}`, name: spec.name, kind: spec.kind, magnitude: spec.magnitude, turnsLeft: spec.turns, source: sourceName ?? null };
  state.globalEffects.push(effect);
  return `🌐 ${spec.name} grips Maple Hollow${sourceName ? ` — ${sourceName} fell through` : ""}: ${describe(effect)} for ${spec.turns} round(s)`;
}

/** Total per-turn levy currently in force (charged to each shop at upkeep). */
export function levyDue(state) {
  return (state.globalEffects ?? []).filter((e) => e.kind === "levy").reduce((s, e) => s + e.magnitude, 0);
}

/** Upkeep: charge this player their share of any town levy. */
export function chargeLevy(state, player) {
  const due = levyDue(state);
  if (due <= 0) return [];
  cashOut(state, player, ACCT.LICENSES, due, "Town levy");
  return [`🌐 ${player.name} pays the ${w(due)} town levy`];
}

/** Multiplier on a freshly-drawn job's value from any boom/recession in force. */
export function jobValueFactor(state) {
  let f = 1;
  for (const e of state.globalEffects ?? []) {
    if (e.kind === "boom") f += e.magnitude;
    if (e.kind === "recession") f -= e.magnitude;
  }
  return Math.max(0.1, f);
}

/** Once per round (round wrap): tick every effect's timer and clear the expired. Returns log lines. */
export function tickGlobals(state) {
  if (!state.globalEffects?.length) return [];
  for (const e of state.globalEffects) e.turnsLeft -= 1;
  const expired = state.globalEffects.filter((e) => e.turnsLeft <= 0);
  state.globalEffects = state.globalEffects.filter((e) => e.turnsLeft > 0);
  return expired.map((e) => `🌐 ${e.name} lifts — Maple Hollow gets back to business`);
}
