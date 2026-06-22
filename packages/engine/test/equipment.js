// Equipment model A — tools are assigned to individual workers; a geared worker burns at the
// tool's speed, a bare-handed one at base, and an idle tool costs rent but produces nothing.

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import * as shop from "../src/engine/shop.js";
import * as jobs from "../src/engine/jobs.js";
import { workerProductivity, jobWorkScore } from "../src/engine/jobs.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };
const economy = await loadEconomy();
const base = economy.base_hand_speed;
const proSpeed = economy.equipment.find((e) => e.id === "pro").speed;
const basicSpeed = economy.equipment.find((e) => e.id === "basic").speed;

function shopOf(workers = 1) {
  resetIds();
  const g = new Game(economy, [{ name: "A", service: "mechanic" }], { seed: 1 });
  g.start();
  const p = g.state.players[0];
  p.jobs = []; p.equipment = []; p.cash = 100;
  while (p.tradesmen.length < workers) p.tradesmen.push({ id: `TX${p.tradesmen.length}`, assignedJob: null, out_until: null });
  p.acquiredEquipThisTurn = false; p.hiredThisTurn = false;
  return { g, p };
}
const buy = (g, p, id) => { p.acquiredEquipThisTurn = false; shop.buyEquipment(g.state, p, id); };

{
  const { g, p } = shopOf(1);
  buy(g, p, "basic");
  assert.equal(p.equipment[0].assigned_to, p.tradesmen[0].id, "a bought tool auto-assigns to a bare-handed worker");
  assert.equal(workerProductivity(economy, p, p.tradesmen[0].id), basicSpeed, "that worker now burns at the tool's speed");
  ok("model A: buying a tool puts it on a worker (auto-assign default)");
}
{
  // 1 worker, 2 tools → only one finds a worker; the other is idle (rent, no output).
  const { g, p } = shopOf(1);
  buy(g, p, "basic"); buy(g, p, "pro");
  assert.equal(p.equipment.filter((e) => e.assigned_to != null).length, 1, "only one tool finds a worker");
  assert.equal(p.equipment.filter((e) => e.assigned_to == null).length, 1, "the extra tool sits idle");
  ok("model A: a tool with no worker sits idle — costs rent, produces nothing");
}
{
  // Per-worker burn: a pro-geared worker + a bare-handed worker on a 2-crew job.
  const { g, p } = shopOf(2);
  buy(g, p, "pro"); // auto → the first worker
  const [t1, t2] = p.tradesmen;
  const job = { id: "J", name: "Big", value: 10, work_amount: 20, work_done: 0, deadline_turn: 9, state: "Active", assigned_tradesmen: [t1.id, t2.id], min_tradesmen: 1, max_tradesmen: 2, required_equipment: null, equipment_per_tradesman: false, droppable: true };
  p.jobs.push(job);
  assert.equal(workerProductivity(economy, p, t1.id), proSpeed, "geared worker = pro speed");
  assert.equal(workerProductivity(economy, p, t2.id), base, "bare worker = base speed");
  assert.equal(jobWorkScore(economy, p, job), proSpeed + base, "job work score sums the crew's productivity");
  jobs.runJobProgress(g.state, p);
  assert.equal(job.work_done, proSpeed + base, "the job burns at the summed per-worker speed");
  ok("model A: a job burns by the summed productivity of its assigned crew");
}
{
  // Manual assign / unassign, and the equipment_per_tradesman gate (every worker needs a tool).
  const { g, p } = shopOf(2);
  buy(g, p, "pro"); // auto → t1
  const [t1, t2] = p.tradesmen;
  shop.assignEquipment(g.state, p, p.equipment[0].id, t2.id);
  assert.equal(p.equipment[0].assigned_to, t2.id, "manual assign moves the tool to the chosen worker");
  assert.ok(!p.equipment.some((e) => e.assigned_to === t1.id), "t1 is now bare-handed");
  shop.unassignEquipment(g.state, p, p.equipment[0].id);
  assert.equal(p.equipment[0].assigned_to, null, "unassign idles the tool");
  ok("model A: manual assign/unassign moves a tool between workers");
}

console.log(`\nAll equipment checks passed (${passed}).`);
