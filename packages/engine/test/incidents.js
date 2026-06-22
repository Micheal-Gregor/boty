// Building-incident test — one incident spawns a tender per trade to the matching player.

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { applyIncident } from "../src/engine/incidents.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };
const economy = await loadEconomy();
const S = economy.services;

// A multi-trade incident spawns one tender per trade, each to that trade's player.
{
  resetIds();
  const g = new Game(economy, S.map((s, i) => ({ name: `P${i + 1}`, service: s })), { seed: 1 });
  g.start();
  const card = { name: "Storm damage", trades: ["plumber", "electrician", "welder"], value: 8, work_amount: 4, deadline: 3, terms: 1, min_tradesmen: 1, max_tradesmen: 1, required_equipment: null, droppable: true };
  const res = applyIncident(g.state, g.state.players[0], card);
  assert.equal(res.tenders.length, 3, "three tenders for three trades");
  for (const trade of card.trades) {
    const who = g.state.players.find((p) => p.service === trade);
    assert.ok(who.jobs.some((j) => j.name.includes(trade) && j.hirer_id == null), `${trade} got an NPC-paid tender`);
  }
  ok("incident → a tender per trade, to the matching trade-player (NPC-paid)");
}

// Trades nobody at the table runs are quietly handled by the NPC (no tender).
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const card = { name: "Mill breakdown", trades: ["welder", "mechanic"], value: 9, work_amount: 5, deadline: 4, terms: 1, min_tradesmen: 1, max_tradesmen: 1, required_equipment: null, droppable: true };
  const res = applyIncident(g.state, g.state.players[0], card);
  assert.equal(res.tenders.length, 1, "only the mechanic's tender lands; the welder one is NPC-handled");
  assert.ok(g.state.players[0].jobs.some((j) => j.name.includes("mechanic")), "the mechanic drew their own tender");
  ok("incident: trades with no local player are handled off-screen");
}

console.log(`\nAll incident checks passed (${passed}).`);
