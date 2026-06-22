// Crew-life events (WORLD.md §4-A). A tradesperson can be sidelined for a few turns (holiday,
// sick day, injury) — pulled off any job, still on the payroll, unavailable until they're back.
// Injury also lands a workers'-comp claim (an insurance deductible if covered). Poached lures a
// worker away unless you can match a retention raise. The "sideline" verb is shared.

import { w } from "./economy.js";
import { cashOut, ACCT } from "../state/ledger.js";
import { bearLoss } from "./modifiers.js";
import { releaseTradesman, isSidelined } from "./jobs.js";

/** Pick a worker to hit: an idle, available one first, else any available one. */
function pickWorker(player, turn) {
  const avail = player.tradesmen.filter((t) => !isSidelined(t, turn));
  return avail.find((t) => t.assignedJob == null) ?? avail[0] ?? null;
}

/** Resolve a drawn crew event against the player. Returns a summary (for the Fortune feed). */
export function applyCrewEvent(state, player, card) {
  const turn = state.turn;
  const t = pickWorker(player, turn);
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
    const raise = card.raise ?? 3;
    if (player.cash >= raise) {
      cashOut(state, player, ACCT.COGS_LABOUR, raise, `${card.name} — retention raise`);
      return { type: "crew", name: card.name, text: `${t.id} was poached — paid ${w(raise)} to keep them` };
    }
    if (t.assignedJob != null) releaseTradesman(state, player, t.id);
    player.tradesmen = player.tradesmen.filter((x) => x.id !== t.id);
    return { type: "crew", name: card.name, text: `${t.id} poached away — couldn't match the offer` };
  }

  return { type: "crew", name: card.name, text: "(no effect)" };
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
