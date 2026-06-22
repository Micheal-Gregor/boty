// Global cards & civic (political) jobs — deliver one and the Mayor owes favours; let one collapse
// and a town-wide effect (a levy) grips every shop.

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { drawFortune } from "../src/engine/fortune.js";
import * as jobs from "../src/engine/jobs.js";
import { applyGlobal, chargeLevy, levyDue, tickGlobals, resetGlobals } from "../src/engine/globals.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };
const economy = await loadEconomy();

const civic = { type: "job", id: "civic", name: "Civic project", value: 25, work_amount: 6, deadline: 4, terms: 2, min_tradesmen: 1, max_tradesmen: 2, required_equipment: null, droppable: true, subcontract: true, sub_trade: "welder", sub_cost: 20, political: true, favor_reward: 2, global_penalty: { name: "Austerity", kind: "levy", magnitude: 2, turns: 3 } };
function civicGame() {
  resetIds(); resetGlobals();
  const g = new Game(economy, [{ name: "Lead", service: "mechanic" }, { name: "Welder", service: "welder" }], { seed: 1, fortune: [civic] });
  return { g, lead: g.state.players[0], sub: g.state.players[1] };
}

{
  // Delivered → the Mayor owes favours: favor_reward to the lead, a cut to the sub.
  const { g, lead, sub } = civicGame();
  const [drawn] = drawFortune(g.state, lead, 1); // brokered to the welder
  const job = drawn.job;
  jobs.assign(g.state, sub, job.id);
  job.work_done = job.work_amount - 1;
  jobs.runJobProgress(g.state, sub);
  assert.equal(lead.hand.filter((c) => c.type === "favor").length, 2, "the lead earns favor_reward Favors");
  assert.equal(sub.hand.filter((c) => c.type === "favor").length, 1, "the sub earns a Favor for the assist");
  ok("civic completion: the lead gets the favours, the sub a cut");
}
{
  // Collapsed (missed deadline) → a town-wide levy drops on everyone.
  const { g, sub } = civicGame();
  const [drawn] = drawFortune(g.state, g.state.players[0], 1);
  g.state.turn = drawn.job.deadline_turn + 1;
  jobs.expireOverdue(g.state, sub); // the sub's civic contract blows its deadline
  assert.equal(g.state.globalEffects.length, 1, "a global effect grips the town");
  assert.equal(g.state.globalEffects[0].kind, "levy", "it's the austerity levy");
  ok("civic collapse: a failed civic job drops a town-wide penalty (the global card)");
}
{
  // A levy is charged to every shop at upkeep, and lifts after its run.
  resetIds(); resetGlobals();
  const g = new Game(economy, [{ name: "A", service: "mechanic" }], { seed: 1 });
  g.start();
  applyGlobal(g.state, { name: "Levy", kind: "levy", magnitude: 2, turns: 2 }, "test");
  assert.equal(levyDue(g.state), 2, "the levy is in force");
  const p = g.state.players[0];
  const c0 = p.cash;
  chargeLevy(g.state, p);
  assert.equal(p.cash, c0 - 2, "every shop pays the levy at upkeep");
  tickGlobals(g.state);
  assert.equal(g.state.globalEffects[0].turnsLeft, 1, "the timer ticks once per round");
  tickGlobals(g.state);
  assert.equal(g.state.globalEffects.length, 0, "the levy lifts after its run");
  ok("global levy: charged each upkeep, ages out per round");
}

console.log(`\nAll global / civic checks passed (${passed}).`);
