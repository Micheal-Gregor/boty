// Subcontracting (the general-contractor model): you broker a job a rival does, pay them sub_cost,
// bill the customer value (a 25% markup), and keep the spread — or factor to break even.

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { drawFortune } from "../src/engine/fortune.js";
import * as jobs from "../src/engine/jobs.js";
import * as payables from "../src/engine/payables.js";
import { profitAndLoss } from "../src/state/ledger.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };
const economy = await loadEconomy();

// value 15 = sub_cost 12 × 1.25 → a clean 25% markup.
const subCard = { type: "job", id: "sub", name: "Sub job", value: 15, work_amount: 6, deadline: 4, terms: 2, min_tradesmen: 1, max_tradesmen: 2, required_equipment: null, droppable: true, subcontract: true, sub_trade: "plumber", sub_cost: 12 };
function subGame() {
  resetIds();
  const g = new Game(economy, [{ name: "GC", service: "mechanic" }, { name: "Sub", service: "plumber" }], { seed: 1, fortune: [subCard] });
  return { g, gc: g.state.players[0], sub: g.state.players[1] };
}
const deliver = (g, sub, job) => { jobs.assign(g.state, sub, job.id); job.work_done = job.work_amount - 1; jobs.runJobProgress(g.state, sub); };

{
  // Brokering: a mechanic draws a plumbing-only contract → subs it to the plumber.
  const { g, gc, sub } = subGame();
  const [drawn] = drawFortune(g.state, gc, 1);
  assert.equal(gc.jobs.length, 0, "the GC doesn't hold the job");
  assert.equal(sub.jobs.length, 1, "the sub does the work");
  assert.equal(drawn.job.hirer_id, gc.id, "the job is tagged to the GC");
  assert.equal(gc.payables.length, 1, "the GC owes the sub");
  assert.ok(gc.payables[0].pending && gc.payables[0].amount === 12 && gc.payables[0].creditor_id === sub.id, "pending AP = sub_cost to the sub");
  assert.equal(gc.invoices.length, 0, "no customer invoice until it's delivered");
  ok("subcontract: GC brokers — sub does the work, GC owes sub_cost, no invoice yet");
}
{
  // Delivery: the GC bills the customer (value) and the sub's pay comes due (sub_cost). Margin = markup.
  const { g, gc, sub } = subGame();
  const [drawn] = drawFortune(g.state, gc, 1);
  deliver(g, sub, drawn.job);
  assert.equal(gc.invoices.length, 1, "the GC books the customer invoice on delivery");
  assert.equal(gc.invoices[0].amount, 15, "customer invoice = value");
  const ap = gc.payables[0];
  assert.equal(ap.pending, false, "the GC's AP to the sub is now due");
  const sub0 = sub.cash;
  payables.payPayable(g.state, gc, ap.id);
  assert.equal(sub.cash, sub0 + 12, "paying the AP pays the sub the sub_cost (their revenue)");
  g.state.turn = gc.invoices[0].due_turn;
  jobs.collectInvoices(g.state, gc);
  const pl = profitAndLoss(gc);
  assert.equal(pl.revenue, 15, "GC revenue = the customer value");
  assert.equal(pl.grossMargin, 3, "GC gross margin = the 25% markup (15 − 12)");
  ok("subcontract delivery: GC bills the customer, pays the sub, keeps the markup as gross margin");
}
{
  // Factoring the marked-up invoice nets exactly the sub_cost → break-even when you can't wait.
  const { g, gc, sub } = subGame();
  const [drawn] = drawFortune(g.state, gc, 1);
  deliver(g, sub, drawn.job);
  const cash0 = gc.cash;
  g.factorInvoice(gc.invoices[0].id);
  assert.equal(gc.cash - cash0, 12, "25% markup, 20% fee → factoring nets exactly the sub_cost");
  ok("subcontract factoring: 15 × 0.8 = 12 = sub_cost → break even (the markup is the cost of cash now)");
}
{
  // Botch: the sub blows the deadline → the GC's liability clears and they may sue for the lost markup.
  const { g, gc } = subGame();
  const [drawn] = drawFortune(g.state, gc, 1);
  g.state.turn = drawn.job.deadline_turn + 1;
  jobs.expireOverdue(g.state, g.state.players[1]);
  assert.equal(gc.payables.length, 0, "the GC's liability to the sub clears (no delivery)");
  assert.equal(g.state.pendingDamages.length, 1, "a damages claim opens");
  assert.equal(g.state.pendingDamages[0].value, 3, "damages = the lost markup (value 15 − sub_cost 12)");
  ok("subcontract botch: GC's liability clears; they may sue the sub for the lost markup");
}

console.log(`\nAll subcontract checks passed (${passed}).`);
