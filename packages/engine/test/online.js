// Online MULTIPLAYER simulation — the layer that's hard to playtest. Two halves:
//   (a) PROTOCOL (real engine): the online flow is a shared, append-only move list every client
//       replays. Record a session, then deliver it the way Supabase Realtime does — and assert a
//       DUPLICATE event changes nothing (idempotent) and a from-scratch REBUILD converges to the live
//       client. (Full lockstep determinism + chunked catch-up: test/replay.js.)
//   (b) SURFACING (mirror of store.js; see /TURN-FLOW.md §3 S1–S6): the store can't run in Node (Vite
//       glob + browser audio), so run an explicit model of its guards — lastRoundShown / lastTurnKey /
//       lastScanned, with the set-AFTER-replay rebuild rule from buildOnlineGame — over the messy
//       delivery (growing rows, a DUPLICATE storm, a mid-game RECONNECT) and assert each thing
//       surfaces the right NUMBER of times. The looping round-1 card was a rebuild re-firing the round
//       card, so the headline assert is "no round fires twice — ever." Keep rebuild() in lockstep with
//       store.js buildOnlineGame. (Round structure: test/flow.js.)
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { recordable, replay } from "../src/engine/replay.js";
import { resetIds } from "../src/state/state.js";
import { botActions } from "../tools/bot.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();
const seats = [{ name: "Ana", service: "mechanic" }, { name: "Boe", service: "plumber" }, { name: "Cy", service: "welder" }];
const fresh = (seed) => { resetIds(); const g = new Game(economy, seats, { ...decks, difficulty: "standard", seed }); g.start(); return g; };
const snap = (g) => JSON.stringify({ turn: g.state.turn, active: g.state.activePlayerIndex, players: g.state.players, discard: g.state.discard });

// --- (a) PROTOCOL: a short recorded session (seed/driving proven replay-clean in replay.js), delivered messy
{
  const host = fresh(987654);
  const moves = [];
  const p = recordable(host, moves);
  for (let i = 0; i < 8; i++) {
    try { p.hire(); } catch { /* full / no cash */ }
    try { p.buyEquipment("basic"); } catch { /* no cash */ }
    const me = host.state.players[host.state.activePlayerIndex];
    const job = me.jobs.find((j) => ["Queued", "OnHold", "Active"].includes(j.state));
    if (job) { try { p.assignJob(job.id); } catch { /* no free crew */ } }
    p.endTurn();
  }
  const wire = JSON.parse(JSON.stringify(moves));

  const g = fresh(987654); replay(g, wire); const before = snap(g);
  replay(g, wire, wire.length); // a duplicate row with no new moves
  assert.equal(snap(g), before, "a duplicate sync (no new moves) must not change state");

  const cut = Math.floor(wire.length / 2);
  const inc = fresh(987654); replay(inc, wire.slice(0, cut));
  const recon = fresh(987654); replay(recon, wire.slice(0, cut)); // from-scratch rebuild to the same point
  assert.equal(snap(recon), snap(inc), "a reconnect rebuild must converge to the live client's state");
  console.log("  ✓ protocol: duplicate sync is idempotent; reconnect rebuild converges");
}

// --- (b) SURFACING: a full bot game snapshotted into a timeline (the states a syncing client lands on)
const autoResolve = (g) => { g.autoResolveCourt?.(); g.autoResolveSettle?.(); g.autoResolvePoach?.(); g.autoResolveMayor?.(); g.autoResolveReferral?.(); g.autoResolveDamages?.(); };
const sim = fresh(424242);
const timeline = [];
for (let step = 1; step <= 120 && !sim.state.over; step++) {
  try { botActions(sim, "balanced"); } catch { /* best effort */ }
  autoResolve(sim);
  const ctx = sim.endTurn();
  if (ctx?.reckoning) { sim.closeBooks(); break; }
  const seat = sim.state.activePlayerIndex;
  timeline.push({ progress: step, turn: sim.state.turn, seat, logLen: sim.state.log.length, drew: (sim.state.players[seat]?.drewThisTurn ?? []).length });
}
const rounds = new Set(timeline.map((r) => r.turn)).size;
assert.ok(rounds >= 5 && timeline.length >= 12, `need several rounds to test (got ${rounds} rounds / ${timeline.length} turns)`);

const client = () => ({ lastRoundShown: 0, lastTurnKey: "", lastScanned: 0, seen: 0, roundFires: [], drawFires: 0, scans: 0 });
function sync(c, row) {
  if (row.progress <= c.seen) return; // S6: no new moves → nothing surfaces
  c.seen = row.progress;
  if (row.turn > c.lastRoundShown) { c.roundFires.push(row.turn); c.lastRoundShown = row.turn; } // S1
  const key = `${row.turn}:${row.seat}`;
  if (key !== c.lastTurnKey) { c.lastTurnKey = key; if (row.drew) c.drawFires += 1; } // S2
  if (row.logLen > c.lastScanned) { c.scans += row.logLen - c.lastScanned; c.lastScanned = row.logLen; } // S3
}
function rebuild(c, row) { // first join OR reconnect — guards set AFTER replay (store.js buildOnlineGame)
  c.seen = row.progress;
  c.lastScanned = row.progress ? row.logLen : 0;
  c.lastRoundShown = row.progress ? row.turn : row.turn - 1; // a mid-game rebuild starts PAST the current round
  c.lastTurnKey = `${row.turn}:${row.seat}`;
}

const steady = client();
for (const row of timeline) sync(steady, row);
assert.equal(new Set(steady.roundFires).size, steady.roundFires.length, "S1: no round fires twice (steady client)");
assert.equal(steady.roundFires.length, rounds, `S1: round card fires once per round (${steady.roundFires.length} vs ${rounds})`);

const dup = client();
for (const row of timeline) { sync(dup, row); sync(dup, row); } // deliver every row twice
assert.deepEqual(dup.roundFires, steady.roundFires, "S6: duplicate deliveries surface no extra round cards");
assert.equal(dup.drawFires, steady.drawFires, "S6: duplicate deliveries surface no extra draws");
assert.equal(dup.scans, steady.scans, "S6: duplicate deliveries re-scan nothing");

const reco = client();
// Reconnect MID-ROUND: rebuild on a row that is NOT the last of its round, so the next sync re-enters
// an already-shown round — the exact shape that looped the round-1 card. (With the old "reset guards on
// rebuild" bug, that next sync re-fires the round; this assert fails. Verified by temporarily reverting.)
let r = 1;
for (let i = 1; i < timeline.length - 1; i++) { if (timeline[i].turn === timeline[i + 1].turn) { r = i; break; } }
for (let i = 0; i <= r; i++) sync(reco, timeline[i]);
rebuild(reco, timeline[r]);
for (let i = r + 1; i < timeline.length; i++) sync(reco, timeline[i]);
assert.equal(new Set(reco.roundFires).size, reco.roundFires.length, "S1: a mid-round reconnect must NOT re-fire a round already shown (the looping-card bug)");

console.log(`  ✓ surfacing: round card once per round (${rounds}); survives a duplicate storm + a mid-game reconnect`);
console.log("All online sim checks passed (2).");
