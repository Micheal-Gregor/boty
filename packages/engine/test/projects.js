// Phased story-projects: a 50% deposit (deferred revenue) up front, phases worked in parallel
// (self + subbed), the balance + favours on full delivery — or forfeit + a town penalty on collapse.

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { drawFortune } from "../src/engine/fortune.js";
import * as jobs from "../src/engine/jobs.js";
import { tickProjects, resetProjects } from "../src/engine/projects.js";
import { resetGlobals } from "../src/engine/globals.js";
import { balances, profitAndLoss, ACCT } from "../src/state/ledger.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };
const economy = await loadEconomy();

const proj = { type: "project", id: "proj", name: "Big Project", value: 40, deposit_fraction: 0.5, deadline: 5, political: true, favor_reward: 2, global_penalty: { name: "Levy", kind: "levy", magnitude: 2, turns: 3 }, phases: [{ name: "Frame", trade: null, work_amount: 4 }, { name: "Wire", trade: "electrician", sub_cost: 8, work_amount: 4 }, { name: "Plumb", trade: "plumber", sub_cost: 8, work_amount: 4 }] };
function projGame() {
  resetIds(); resetProjects(); resetGlobals();
  const g = new Game(economy, [{ name: "Lead", service: "mechanic" }, { name: "Elec", service: "electrician" }, { name: "Plumb", service: "plumber" }], { seed: 1, fortune: [proj] });
  return { g, lead: g.state.players[0], elec: g.state.players[1], plumb: g.state.players[2] };
}
const finishPhase = (g, holder) => {
  const job = holder.jobs.find((j) => j.project_id);
  jobs.assign(g.state, holder, job.id);
  job.work_done = job.work_amount - 1;
  jobs.runJobProgress(g.state, holder);
};

{
  // Start: 50% deposit collected as deferred revenue; 3 phases spawned; the two subs are owed.
  const { g, lead, elec, plumb } = projGame();
  const c0 = lead.cash;
  drawFortune(g.state, lead, 1);
  assert.equal(lead.cash, c0 + 20, "the 50% deposit lands as cash now");
  assert.equal(balances(lead)[ACCT.DEFERRED_REV], -20, "but it's booked as a deferred-revenue liability, not income");
  assert.equal(profitAndLoss(lead).revenue, 0, "no revenue recognised yet — the work isn't done");
  assert.ok(lead.jobs.some((j) => j.project_id && !j.hirer_id), "the lead holds the self phase");
  assert.ok(elec.jobs.some((j) => j.project_id && j.hirer_id === lead.id), "the electrician holds a sub phase");
  assert.ok(plumb.jobs.some((j) => j.project_id && j.hirer_id === lead.id), "the plumber holds a sub phase");
  assert.equal(lead.payables.filter((a) => a.project_id).length, 2, "the lead owes the two subs");
  assert.equal(g.state.projects.length, 1, "the project is in flight");
  ok("project start: deposit (deferred rev) + 3 parallel phases (self + 2 subs)");
}
{
  // Deliver every phase → recognise the full value, collect the balance, favours all round.
  const { g, lead, elec, plumb } = projGame();
  drawFortune(g.state, lead, 1);
  finishPhase(g, lead); finishPhase(g, elec); finishPhase(g, plumb);
  assert.equal(g.state.projects.length, 0, "the project is delivered and closed");
  assert.equal(profitAndLoss(lead).revenue, 40, "the full value is now recognised as revenue");
  assert.equal(lead.hand.filter((c) => c.type === "favor").length, 2, "the lead earns favor_reward Favors");
  assert.ok(elec.hand.some((c) => c.type === "favor") && plumb.hand.some((c) => c.type === "favor"), "each sub earns a Favor cut");
  ok("project delivered: balance + full revenue + favours to the lead and the subs");
}
{
  // Collapse past deadline → keep the deposit (income for partial work), forfeit the balance, town pays.
  const { g, lead, elec } = projGame();
  drawFortune(g.state, lead, 1);
  g.state.turn = g.state.projects[0].deadlineTurn + 1;
  const lines = tickProjects(g.state, lead);
  assert.equal(g.state.projects.length, 0, "the project collapsed");
  assert.equal(g.state.globalEffects.length, 1, "a town-wide penalty fired");
  assert.equal(profitAndLoss(lead).revenue, 20, "the deposit is kept as income; the balance is forfeited");
  assert.ok(!lead.jobs.some((j) => j.project_id) && !elec.jobs.some((j) => j.project_id), "the remaining phases are cleaned off the table");
  assert.ok(lines.some((l) => /COLLAPSED/.test(l)), "the collapse is logged");
  ok("project collapse: forfeit the balance, keep the deposit, the town pays, phases cleaned up");
}

console.log(`\nAll project checks passed (${passed}).`);
