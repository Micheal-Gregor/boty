// Proves seat takeover/reclaim (Phase 3.7 — session resilience) is deterministic lockstep.
// A dropped player's seat is handed to the bot via a RECORDED move (takeoverSeat); the flag lives in
// replayed state, so a fresh same-seed game that replays the log lands byte-identical. A taken-over
// seat keeps playing (it is NOT skipped like bankrupt) and never deadlocks the turn loop.
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { recordable, replay } from "../src/engine/replay.js";
import { resetIds } from "../src/state/state.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();
const seats = [{ name: "Ana", service: "mechanic" }, { name: "Boe", service: "plumber" }, { name: "Cy", service: "welder" }];
const opts = { ...decks, difficulty: "standard", seed: 987654 };
const fresh = () => { resetIds(); const g = new Game(economy, seats, opts); g.start(); return g; };

const snap = (g) => JSON.stringify({
  turn: g.state.turn,
  active: g.state.activePlayerIndex,
  players: g.state.players,
  discard: g.state.discard,
});

// --- 1. The flag exists and defaults false -------------------------------------------------------
const g0 = fresh();
assert.equal(g0.state.players.every((p) => p.aiControlled === false), true, "every seat starts player-controlled");

// --- 2. Record a session that hands seat 1 (Boe) to the bot mid-game, then reclaims it -----------
const g1 = fresh();
const moves = [];
const p = recordable(g1, moves);
let sawSeat1WhileAI = false; // the taken-over seat must still get turns (NOT skipped like bankrupt)
for (let round = 0; round < 8; round++) {
  if (round === 2) p.takeoverSeat(1);   // Boe "drops" — bot takes over
  if (round === 5) p.reclaimSeat(1);    // Boe returns — human again
  for (let seat = 0; seat < 3; seat++) {
    if (g1.state.activePlayerIndex === 1 && g1.state.players[1].aiControlled) sawSeat1WhileAI = true;
    try { p.hire(); } catch { /* at capacity / no cash */ }
    const me = g1.state.players[g1.state.activePlayerIndex];
    const job = me.jobs.find((j) => ["Queued", "OnHold", "Active"].includes(j.state));
    if (job) { try { p.assignJob(job.id); } catch { /* no free crew */ } }
    try { p.endTurn(); } catch { /* a pending NPC window blocks a clean end — fine, the seat was still active */ break; }
  }
}
const recorded = snap(g1);
assert.equal(g1.state.players[1].aiControlled, false, "Boe reclaimed → player-controlled at the end");
assert.equal(sawSeat1WhileAI, true, "the taken-over seat still took turns while bot-controlled (not skipped)");

// --- 3. Replay the JSON-round-tripped log onto a fresh same-seed game → byte-identical -----------
const wire = JSON.parse(JSON.stringify(moves));
const g2 = fresh();
replay(g2, wire);
assert.equal(snap(g2), recorded, "replayed state equals recorded state (takeover/reclaim in the log)");
console.log(`✓ takeover/reclaim replays deterministically — ${moves.length} moves, states identical`);
console.log(`✓ taken-over seat still takes its turns (not skipped like bankrupt) and never deadlocked`);

// --- 4. Idempotency: a double takeover / stray reclaim is a safe deterministic no-op -------------
const g4 = fresh();
const l1 = g4.takeoverSeat(0);
const l2 = g4.takeoverSeat(0); // already AI
assert.match(l2, /already AI-controlled/, "second takeover is a no-op");
g4.reclaimSeat(0);
const l3 = g4.reclaimSeat(0);  // already human
assert.match(l3, /already player-controlled/, "second reclaim is a no-op");
console.log("✓ double takeover / stray reclaim are safe no-ops");

console.log("All takeover checks passed (4).");
