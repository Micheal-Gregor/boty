// Building incidents (WORLD.md §C) — the work engine reframed. A drawn incident at a town building
// spawns one TENDER per trade the building needs, each handed to the player who runs that trade as
// their own NPC-paid job (the building owner is the customer — the drawer isn't on the hook). It's
// how "the community" puts work on the table: everyone picks up the tenders matching their trade.

import { createJob } from "../state/state.js";
import { w } from "./economy.js";

/** The solvent player who runs a trade (prefer the drawer when they match it). */
function tradePlayer(state, trade, drawer) {
  const who = state.players.filter((p) => !p.bankrupt && p.service === trade);
  if (drawer && who.includes(drawer)) return drawer;
  return who[0] ?? null;
}

/**
 * Resolve a building incident: for each trade the building needs, spawn a tender into the matching
 * trade-player's queue. Trades nobody runs are handled by an NPC off-screen (no tender). Returns a
 * summary of who got what.
 */
export function applyIncident(state, drawer, card) {
  const tenders = [];
  for (const trade of card.trades ?? []) {
    const who = tradePlayer(state, trade, drawer);
    if (!who) continue; // no local trade for it → the NPC sorts it out
    const job = createJob({ ...card, required_trade: null }, state.turn); // a plain NPC-paid job
    job.name = `${card.name} — ${trade}`;
    who.jobs.push(job);
    tenders.push({ trade, playerId: who.id, jobId: job.id, value: job.value, name: who.name });
  }
  const summary = tenders.length
    ? tenders.map((t) => `${t.trade}→${t.name}`).join(", ")
    : "no local trade could take it";
  return { type: "incident", name: card.name, tenders, text: `incident at ${card.name}: ${tenders.length} tender(s) — ${summary}` };
}
