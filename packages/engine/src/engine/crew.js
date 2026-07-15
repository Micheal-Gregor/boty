// Crew-life events (WORLD.md §4-A). A tradesperson can be sidelined for a few turns (holiday,
// sick day, injury) — pulled off any job, still on the payroll, unavailable until they're back.
// Injury also lands a workers'-comp claim (an insurance deductible if covered). Poached lures a
// worker away unless you can match a retention raise. The "sideline" verb is shared.

import { w } from "./economy.js";
import { cashOut, ACCT } from "../state/ledger.js";
import { bearLoss } from "./modifiers.js";
import { releaseTradesman, isSidelined } from "./jobs.js";
import { injectById } from "./livingdeck.js";

/** Pick a worker to hit — RANDOMLY (via the seeded, replay-safe state.rng), not always the first.
 *  Prefers an idle worker so an event doesn't needlessly pull someone off a job, but randomises the
 *  choice within that group; falls back to a random available worker. */
function pickWorker(state, player) {
  const avail = player.tradesmen.filter((t) => !isSidelined(t, state.turn));
  if (!avail.length) return null;
  const idle = avail.filter((t) => t.assignedJob == null);
  const pool = idle.length ? idle : avail;
  return pool[Math.floor(state.rng() * pool.length)];
}

/** Resolve a drawn crew event against the player. Returns a summary (for the Fortune feed). */
export function applyCrewEvent(state, player, card) {
  const turn = state.turn;
  const t = pickWorker(state, player);
  if (!t) return { type: "crew", name: card.name, text: "no crew on hand to affect" };

  if (card.effect === "sideline" || card.effect === "injury") {
    if (t.assignedJob != null) releaseTradesman(state, player, t.id); // off the job
    t.out_until = turn + (card.duration ?? 1);
    let note = `${t.id} is out until turn ${t.out_until}`;
    if (card.effect === "injury" && card.claim) {
      const { borne, covered, insured } = bearLoss(player, card.claim);
      cashOut(state, player, ACCT.LEGAL, borne, `${card.name} — workers' comp`);
      note += ` — ${w(borne)} workers' comp${insured && covered > 0 ? ` (insured, ${w(covered)} covered)` : ""}`;
    }
    return { type: "crew", name: card.name, text: note };
  }

  if (card.effect === "poached") {
    // A rival dangles a paycheck — the player decides: counter-offer (+roll) or let them walk.
    state.pendingPoach.push({ playerId: player.id, workerId: t.id });
    return { type: "crew", name: card.name, text: `the Pettigrews are dangling a paycheck at ${t.id} — match it or lose them` };
  }

  return { type: "crew", name: card.name, text: "(no effect)" };
}

/** Upkeep: keep a flagged thief on the payroll and they keep stealing — a chance each round to slip
 *  another tool_theft into your deck (capped). Firing them (clearing the flag) stops it. */
export function tickTheftEscalation(state, player) {
  const cfg = state.economy.theft ?? {};
  const cap = cfg.escalation_cap ?? 2;
  if ((player.theftEscalations ?? 0) >= cap) return [];
  if (!(player.tradesmen ?? []).some((t) => t.flag === "theft")) return [];
  if (state.die() > (cfg.escalation_chance ?? 3)) return []; // they lie low this round
  player.theftEscalations = (player.theftEscalations ?? 0) + 1;
  injectById(state, player, "tool_theft", 1, "a kept thief strikes again");
  return [`🚨 ${player.name} kept a flagged thief on — another tool theft slips into their deck`];
}

/** Upkeep: bring back any worker whose time out has elapsed. */
export function returnCrew(state, player) {
  const lines = [];
  for (const t of player.tradesmen) {
    if (t.out_until != null && t.out_until <= state.turn) {
      t.out_until = null;
      lines.push(`${player.name}'s ${t.id} is back on the job`);
    }
  }
  return lines;
}
