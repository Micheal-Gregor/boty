// Turn & round FLOW invariants (see /TURN-FLOW.md §2). Instead of playtesting and eyeballing, drive
// full bot games and assert the round structure holds: clean rotation (no seat acts twice in a round),
// the turn counter ticks exactly once per round, the game terminates, and the pending-decision gate
// blocks ending a turn. This is the automated stand-in for "is the multiplayer flow correct?".
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { botActions } from "../tools/bot.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();
const autoResolve = (g) => { g.autoResolveCourt?.(); g.autoResolveSettle?.(); g.autoResolvePoach?.(); g.autoResolveMayor?.(); g.autoResolveReferral?.(); g.autoResolveDamages?.(); };

for (const seed of [3, 11, 29]) {
  resetIds();
  const g = new Game(economy, [
    { name: "A", service: "mechanic" }, { name: "B", service: "plumber" }, { name: "C", service: "electrician" },
  ], { ...decks, seed, rotateFirst: true });
  g.start();

  const seq = []; // one entry per turn handed out: { turn (round), seat }
  let guard = 0, endedVia = "";
  while (!g.state.over && guard++ < 400) {
    seq.push({ turn: g.state.turn, seat: g.state.activePlayerIndex });
    try { botActions(g, "balanced"); } catch { /* best effort */ }
    autoResolve(g);
    const ctx = g.endTurn();
    // Year-end opens the Final Reckoning (Last Licks), NOT game-over — it's driven by seatReckoning/
    // closeBooks, not endTurn (calling endTurn through it re-triggers the year-end and spins). Close it.
    if (ctx?.reckoning) { endedVia = "reckoning"; g.closeBooks(); break; }
    if (g.state.over) endedVia = "all-bankrupt";
  }

  // Game terminates correctly within the year (no runaway loop), via the reckoning or all-bankrupt.
  assert.ok(g.state.over, `seed ${seed}: game did not end within ${guard} turns`);
  assert.ok(endedVia, `seed ${seed}: ended without a recognised path (reckoning / all-bankrupt)`);
  assert.ok(g.state.turn <= economy.max_turns + 1, `seed ${seed}: ran past max_turns (${g.state.turn} > ${economy.max_turns})`);

  // Group consecutive same-turn entries into rounds.
  const rounds = [];
  for (const s of seq) {
    const last = rounds[rounds.length - 1];
    if (last && last.turn === s.turn) last.seats.push(s.seat);
    else rounds.push({ turn: s.turn, seats: [s.seat] });
  }

  // Invariant 2: the turn counter increments by EXACTLY one between consecutive rounds.
  for (let i = 1; i < rounds.length; i++) {
    assert.equal(rounds[i].turn, rounds[i - 1].turn + 1, `seed ${seed}: turn jumped ${rounds[i - 1].turn} → ${rounds[i].turn} (should step by 1)`);
  }

  // Invariant 1: within a round, NO seat acts twice (clean rotation; bankrupt seats just drop out).
  for (const r of rounds) {
    assert.equal(new Set(r.seats).size, r.seats.length, `seed ${seed}: a seat acted twice in round ${r.turn} — seats ${r.seats}`);
    assert.ok(r.seats.length <= g.state.players.length, `seed ${seed}: round ${r.turn} handed out more turns than seats`);
  }

  console.log(`  ✓ seed ${seed}: ${rounds.length} rounds over ${seq.length} turns — single-increment, clean rotation, terminates`);
}

// Invariant 4: the pending-decision gate BLOCKS ending a turn (the response window must be resolved first).
{
  resetIds();
  const g = new Game(economy, [{ name: "A", service: "mechanic" }, { name: "B", service: "plumber" }], { ...decks, seed: 5 });
  g.start();
  g.state.pendingThreat = { type: "sabotage", attackerId: g.state.players[1].id, ownerId: g.state.players[0].id, jobId: "x" };
  assert.throws(() => g.endTurn(), /response window|pending/i, "endTurn must throw while a response window is open");
  g.state.pendingThreat = null;
  assert.doesNotThrow(() => g.endTurn(), "endTurn proceeds once the window is cleared");
  console.log("  ✓ pending-decision gate blocks endTurn until resolved");
}

console.log("All turn/round flow checks passed (4).");
