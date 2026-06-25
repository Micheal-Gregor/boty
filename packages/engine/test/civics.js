// Civic builds — a contract to the whole town: ONE sub-contract per player (sized by their shop),
// the drawer is PM (20% bonus + favours when all land), a global levy if the deadline's blown.

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { startCivic, onCivicContractComplete, tickCivics } from "../src/engine/civics.js";

let passed = 0;
const ok = (l) => { passed++; console.log(`  ✓ ${l}`); };
const economy = await loadEconomy();
const CARD = { type: "civic", id: "county_hospital", name: "County Hospital wing", deadline: 5, favor_reward: 2, global_penalty: { name: "Hospital overrun levy", kind: "levy", magnitude: 2, turns: 3 } };
function game(n) {
  resetIds();
  const g = new Game(economy, Array.from({ length: n }, (_, i) => ({ name: "P" + i, service: "mechanic" })), { seed: 1 });
  g.start();
  for (const p of g.state.players) p.jobs = [];
  g.state.civics = [];
  return g;
}
const contractsOf = (p) => p.jobs.filter((j) => j.civic_id);

// THE BUG: a 3-player civic must give ONE contract to each player, not 3 to the drawer.
{
  const g = game(3);
  const drawer = g.state.players[0];
  startCivic(g.state, drawer, CARD);
  assert.equal(g.state.civics.length, 1);
  assert.equal(g.state.civics[0].pm_id, drawer.id, "drawer is PM");
  for (const p of g.state.players) assert.equal(contractsOf(p).length, 1, `${p.name} gets exactly one contract`);
  ok("civic: ONE contract per player (drawer isn't handed all three)");
}
// sized by the shop (a starter garage = tier 1)
{
  const g = game(2);
  startCivic(g.state, g.state.players[0], CARD);
  const job = contractsOf(g.state.players[0])[0];
  assert.equal(job.max_tradesmen, 2);
  assert.equal(job.value, 8);
  assert.equal(job.droppable, false, "civic contracts can't be dropped");
  ok("civic: a garage shop → a 2-crew / 8 W contract");
}
// all contracts delivered → the PM takes the bonus + favours
{
  const g = game(2);
  const pm = g.state.players[0];
  const cash0 = pm.cash;
  startCivic(g.state, pm, CARD);
  for (const p of g.state.players) onCivicContractComplete(g.state, p, contractsOf(p)[0]);
  assert.equal(pm.cash, cash0 + Math.round((8 + 8) * 0.2), "PM bonus = 20% of total contracts");
  assert.equal(pm.hand.filter((c) => c.type === "favor").length, 2, "PM earns 2 favours");
  assert.equal(g.state.civics.length, 0, "civic cleared once fully delivered");
  ok("civic: all contracts in → PM bonus + favours");
}
// missed deadline → the whole town eats a levy
{
  const g = game(2);
  startCivic(g.state, g.state.players[0], CARD);
  g.state.turn = g.state.civics[0].deadline_turn + 1;
  tickCivics(g.state);
  assert.equal(g.state.civics.length, 0, "the blown civic is cleared");
  assert.ok(g.state.globalEffects.some((e) => e.kind === "levy"), "a global levy hits the town");
  ok("civic: missed deadline → global penalty on everyone");
}

console.log(`\nAll civic checks passed (${passed}).`);
