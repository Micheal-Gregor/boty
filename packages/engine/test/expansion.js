// Expansion projects — growth as a deferred capital project: deposit + insurance + town contracts
// now, balance + capitalisation + move-in next round.

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import * as jobs from "../src/engine/jobs.js";
import { tickExpansion } from "../src/engine/expansion.js";
import { balances, ACCT } from "../src/state/ledger.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };
const economy = await loadEconomy();
const S = economy.services;
const EX = economy.expansion;
const game = (n = 4) => {
  resetIds();
  const g = new Game(economy, Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, service: S[i % S.length] })), { seed: 1 });
  g.start();
  return g;
};
// Simulate every fit-out contract delivered (cleared from all queues) so the move can complete.
const finishFitout = (g) => { for (const p of g.state.players) p.jobs = p.jobs.filter((j) => !j.readying); };

// Start: deposit + insurance down, contracts out, stays in the old shop.
{
  const g = game(); const me = g.currentPlayer; me.cash = 60;
  g.startExpansion("shop");
  const dep = Math.round(EX.shop.fee * EX.deposit_fraction);
  assert.equal(me.cash, 60 - dep - EX.insurance, "paid the deposit + insurance up front");
  assert.equal(me.building, economy.starting_building, "still in the OLD building (low rent) until move-in");
  assert.ok(me.pendingExpansion?.target === "shop", "expansion is pending");
  assert.ok(me.jobs.some((j) => j.readying), "the mover holds their own trade's readying contract");
  assert.ok(g.state.players.slice(1).some((p) => p.jobs.some((j) => j.readying)), "contracts went out to the town");
  ok("expansion start: deposit + insurance down, six trade contracts out, you keep the old shop");
}

// The move-in is GATED on the fit-out: outstanding contracts hold you in the old shop.
{
  const g = game(); const me = g.currentPlayer; me.cash = 60;
  g.startExpansion("shop");
  g.state.turn += 1;
  const lines = tickExpansion(g.state, me); // fit-out NOT finished
  assert.equal(me.building, economy.starting_building, "still in the old shop — the fit-out isn't done");
  assert.ok(me.pendingExpansion, "the move is still pending");
  assert.ok(lines.some((l) => /fit-out is still underway/.test(l)), "told the fit-out is outstanding");
  ok("expansion gating: you can't move in until every fit-out contract clears (high rent bites meanwhile)");
}

// Fit-out done → move in, balance paid, fee capitalised.
{
  const g = game(); const me = g.currentPlayer; me.cash = 60;
  g.startExpansion("shop");
  g.state.turn += 1;
  finishFitout(g);
  tickExpansion(g.state, me);
  assert.equal(me.building, "shop", "moved into the Shop");
  assert.equal(me.pendingExpansion, null, "the project is closed out");
  assert.equal(me.cash, 60 - EX.insurance - EX.shop.fee, "across the project you pay insurance + the full fee");
  assert.equal(balances(me)[ACCT.BUILDING], EX.shop.fee, "the whole fee capitalised to the building asset");
  assert.ok(!balances(me)[ACCT.PREPAID], "the prepaid deposit rolled into the asset");
  ok("expansion complete: balance paid, fee capitalised, you move in next round");
}

// A trade that does its fit-out contract gets paid by the landlord.
{
  const g = game(); const me = g.currentPlayer; me.cash = 60;
  g.startExpansion("shop");
  const rival = g.state.players.find((p) => p !== me && p.jobs.some((j) => j.readying));
  const job = rival.jobs.find((j) => j.readying);
  jobs.assign(g.state, rival, job.id);
  job.work_done = job.work_amount - 1;
  jobs.runJobProgress(g.state, rival);
  assert.ok(rival.invoices.some((i) => i.amount === EX.shop.contract_value), "the landlord pays the trade its contract_value");
  ok("expansion contract: your growth puts a rival's crew to work (landlord pays contract_value)");
}

// Forfeit: can't cover the balance at move-in → deposit written off, stays put.
{
  const g = game(); const me = g.currentPlayer; me.cash = 60;
  g.startExpansion("shop");
  me.cash = 3; // can't cover the balance
  g.state.turn += 1;
  finishFitout(g);
  tickExpansion(g.state, me);
  assert.equal(me.building, economy.starting_building, "stayed in the old building");
  assert.equal(me.pendingExpansion, null, "the project is abandoned");
  assert.ok(!balances(me)[ACCT.PREPAID], "the deposit left prepaid — written off");
  assert.ok(balances(me)[ACCT.REPAIRS] >= Math.round(EX.shop.fee * EX.deposit_fraction), "the forfeited deposit is a loss");
  ok("expansion forfeit: short on the balance → deposit written off, stays put");
}

// Improve (BBB-gated): the same flow, in place, for +capacity.
{
  const g = game(); const me = g.currentPlayer; me.cash = 60; me.bbbThisTurn = true;
  g.startExpansion("improve");
  g.state.turn += 1;
  finishFitout(g);
  tickExpansion(g.state, me);
  assert.equal(me.capacityBonus, EX.improve.capacity, "in-place expansion adds crew capacity");
  assert.equal(me.building, economy.starting_building, "improve keeps you in the same building");
  ok("expansion improve (BBB): in-place capacity bump through the same project flow");
}

console.log(`\nAll expansion checks passed (${passed}).`);
