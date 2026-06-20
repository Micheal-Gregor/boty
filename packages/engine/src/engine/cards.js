// Hand-card helpers and effects (Stage 4). Players hold a hand and play cards reactively.
// The response-window orchestration lives in game.js (it touches cross-player state and the
// die); this module holds the hand utilities and the concrete effect each card applies, so
// those effects are small and testable.
//
//   Sabotage  — delay a target's job toward (or past) its deadline. Counterable by Rush.
//   Rush      — recover lost time / speed a job (the counter to Sabotage; salvages a late start).
//   Buy Time  — universal deadline extender: a job, an AP due date, or an AR window.
//   Slick Lawyer — not played standalone; consumed as a civil-roll modifier (see game.js).

import { GameError } from "./economy.js";

/** Find a hand card by instance index or by type; returns { card, index }. */
export function findHandCard(player, ref) {
  let index = -1;
  if (typeof ref === "number") index = ref;
  else index = player.hand.findIndex((c) => c.id === ref || c.type === ref);
  if (index < 0 || index >= player.hand.length) {
    throw new GameError(`${player.name} has no ${ref} in hand`);
  }
  return { card: player.hand[index], index };
}

export function takeFromHand(player, index) {
  return player.hand.splice(index, 1)[0];
}

export function hasCardType(player, type) {
  return player.hand.some((c) => c.type === type);
}

// --- Effects ----------------------------------------------------------------------------

/** Sabotage lands: shrink the job's runway by pulling its deadline earlier. */
export function applySabotage(economy, job) {
  job.deadline_turn -= economy.cards.sabotage_delay;
  return `deadline pulled in by ${economy.cards.sabotage_delay} (now turn ${job.deadline_turn})`;
}

/** Rush played on a job: burn extra work now to recover lost time / salvage a late start. */
export function applyRush(economy, job) {
  job.work_done += economy.cards.rush_work;
  return `rushed +${economy.cards.rush_work} work (${job.work_done}/${job.work_amount})`;
}

/** Buy Time on a job: push its deadline out. */
export function applyBuyTimeJob(economy, job) {
  job.deadline_turn += economy.cards.buy_time_turns;
  return `deadline extended by ${economy.cards.buy_time_turns} (now turn ${job.deadline_turn})`;
}

/** Buy Time on a payable (AP) or invoice (AR): push its date out. */
export function applyBuyTimeDue(economy, item) {
  if (item.due_turn != null) item.due_turn += economy.cards.buy_time_turns;
  return `due date extended by ${economy.cards.buy_time_turns} (now turn ${item.due_turn})`;
}
