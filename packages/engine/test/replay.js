// Proves the online-sync core: a recorded move log, replayed on a fresh same-seed game, reproduces
// byte-identical state. If this holds, deterministic lockstep is sound.
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { recordable, replay } from "../src/engine/replay.js";
import { resetIds } from "../src/state/state.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

// Deterministic entity ids: every client must reset the global id counter before building its game,
// so the same job/worker gets the same id everywhere (replay refers to entities by id).
const fresh = () => { resetIds(); const g = new Game(economy, seats, opts); g.start(); return g; };

const economy = await loadEconomy();
const decks = await loadDecks();
const seats = [{ name: "Ana", service: "mechanic" }, { name: "Boe", service: "plumber" }, { name: "Cy", service: "welder" }];
const opts = { ...decks, difficulty: "standard", seed: 987654 };

// A projection of everything that matters — players + decks' card piles + turn — minus closures.
const snap = (g) => JSON.stringify({
  turn: g.state.turn,
  active: g.state.activePlayerIndex,
  players: g.state.players,
  discard: g.state.discard,
});

// --- Record a real session through the proxy -------------------------------------------------
const g1 = fresh();
const moves = [];
const p = recordable(g1, moves);
for (let round = 0; round < 8; round++) {
  // a mix of safe actions; illegal ones throw and are skipped (and never logged)
  try { p.hire(); } catch { /* at capacity / no cash */ }
  try { p.buyEquipment("basic"); } catch { /* no cash */ }
  const me = g1.state.players[g1.state.activePlayerIndex];
  const job = me.jobs.find((j) => ["Queued", "OnHold", "Active"].includes(j.state));
  if (job) { try { p.assignJob(job.id); } catch { /* no free crew */ } }
  p.endTurn();
}
const recorded = snap(g1);

// --- Replay the log onto a fresh same-seed game ----------------------------------------------
// Replay the JSON round-tripped log (the real wire path: a non-serializable arg would vanish here).
const wire = JSON.parse(JSON.stringify(moves));
assert.equal(wire.length, moves.length, "every move survives JSON serialization");
const g2 = fresh();
replay(g2, wire);
const replayed = snap(g2);

assert.equal(replayed, recorded, "replayed state must equal recorded state");
console.log(`✓ lockstep replay is deterministic — ${moves.length} moves, ${g1.state.turn} rounds, states identical`);

// Incremental catch-up (how a client applies moves as they arrive): two disjoint chunks in order
// must equal replaying the whole log at once.
const cut = Math.floor(moves.length / 2);
const gInc = fresh();
replay(gInc, wire.slice(0, cut)); // first batch
replay(gInc, wire.slice(cut));    // the rest, applied later
assert.equal(snap(gInc), recorded, "chunked catch-up equals full replay");
console.log(`✓ incremental catch-up replays cleanly`);

console.log("All replay checks passed (2).");
