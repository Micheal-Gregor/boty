// Persistent-modifier test (slice 3) — insurance (deductible), marketing (deck injection), Favor.

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds, createEquipment, createDefect } from "../src/state/state.js";
import { drawFortune } from "../src/engine/fortune.js";
import { buyService, hasModifier, tickModifiers, bearLoss, marketingInjection, factoringFeeRate, trainingSpeedBonus, drawCredit, repayCredit, chargeInterest, forceSettleCredit } from "../src/engine/modifiers.js";
import { profitAndLoss, balanceSheet, balances, ACCT } from "../src/state/ledger.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };
const economy = await loadEconomy();

// Insurance: a standing modifier whose premium posts to overhead, and which halves a loss.
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0];
  ana.bbbThisTurn = true;
  g.buyService("insurance");
  assert.ok(hasModifier(ana, "insurance"), "insurance modifier in play");

  const ohBefore = profitAndLoss(ana).overhead;
  const cashBefore = ana.cash;
  tickModifiers(g.state, ana); // an upkeep tick
  assert.equal(ana.cash, cashBefore - 1, "premium charged in cash");
  assert.equal(profitAndLoss(ana).overhead, ohBefore + 1, "premium posts to overhead (6200)");

  assert.deepEqual(bearLoss(ana, 4), { borne: 2, covered: 2, insured: true }, "a 4 W loss → 2 W deductible, 2 W covered");
  ok("insurance: premium = overhead, and it turns a loss into a deductible");
}

// Marketing: injects a job card into the draws.
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0];
  assert.equal(marketingInjection(ana), null, "no injection without marketing");
  ana.bbbThisTurn = true;
  g.buyService("marketing");
  const inj = marketingInjection(ana);
  assert.ok(inj && inj.type === "job", "marketing injects a job card into the draw");
  ok("marketing: injects extra work into your deck");
}

// Favor: cancels a rival's standing perk, and consumes the card.
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }, { name: "Boe", service: "plumber" }], { seed: 1 });
  g.start();
  const [ana, boe] = g.state.players;
  buyService(g.state, boe, "insurance"); // the rival carries insurance
  ana.hand.push({ id: "f1", type: "favor", name: "Favor" });
  g.playFavor(boe.id, "insurance");
  assert.ok(!hasModifier(boe, "insurance"), "the favor cancelled the rival's insurance");
  assert.ok(!ana.hand.some((c) => c.type === "favor"), "the favor card was consumed");
  ok("favor: cuts a rival's standing perk short (scarce, one-shot)");
}
// Favor (new use): waive your OWN code violation — the inspector looks the other way.
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const [ana] = g.state.players;
  ana.defects.push(createDefect({ name: "Unpermitted wiring", productivity_hit: 1, fine: 2, fix_cost: 6, fix_terms: 2 }, g.state.turn));
  ana.hand.push({ id: "f1", type: "favor", name: "Favor" });
  const apsBefore = ana.payables.length;
  g.playFavor(ana.id, ana.defects[0].id); // favor targets your own violation
  assert.equal(ana.defects.length, 0, "the code violation is waived");
  assert.equal(ana.payables.length, apsBefore, "no repair bill is booked — it's a clean waiver");
  assert.ok(!ana.hand.some((c) => c.type === "favor"), "the favor card was consumed");
  ok("favor: waives your own code violation outright (the inspector backs off)");
}

// Accountant halves the factoring fee; training adds a speed bonus.
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0];
  assert.equal(factoringFeeRate(ana, 0.2), 0.2, "no discount without an accountant");
  assert.equal(trainingSpeedBonus(ana), 0, "no bonus without training");
  ana.bbbThisTurn = true;
  g.buyService("accountant");
  g.buyService("training");
  assert.equal(factoringFeeRate(ana, 0.2), 0.1, "accountant halves the factoring fee");
  assert.equal(trainingSpeedBonus(ana), 1, "training adds a speed bonus");
  ok("accountant (cheaper factoring) + training (faster crew)");
}

// Line of credit: debt on the balance sheet, interest on the P&L, repay clears it.
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0];
  const cash0 = ana.cash;
  const draw = economy.line_of_credit.draw;
  g.drawCredit();
  assert.equal(ana.cash, cash0 + draw, "drawing credit adds cash");
  assert.equal(-(balances(ana)[ACCT.LOC] || 0), draw, "and books a liability");
  assert.ok(balanceSheet(ana).balanced, "balance sheet still balances with debt");

  const ohBefore = profitAndLoss(ana).overhead;
  chargeInterest(g.state, ana, economy.line_of_credit.interest);
  assert.equal(profitAndLoss(ana).overhead, ohBefore + Math.ceil(draw * economy.line_of_credit.interest), "interest hits the P&L");

  g.repayCredit(draw);
  assert.equal(balances(ana)[ACCT.LOC] || 0, 0, "repayment clears the line of credit");
  ok("line of credit: cash now, a liability + interest, repayable");
}

// Tool theft: uninsured writes off the rig; insured keeps it for a deductible.
{
  resetIds();
  const theft = { type: "theft", id: "tool_theft", name: "Tool theft" };
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1, fortune: [theft, theft] });
  g.start();
  const ana = g.state.players[0];
  ana.equipment.push(createEquipment("basic", { owned: true }));
  drawFortune(g.state, ana, 1); // uninsured
  assert.equal(ana.equipment.filter((e) => e.owned).length, 0, "uninsured: the stolen rig is written off");
  buyService(g.state, ana, "insurance");
  ana.equipment.push(createEquipment("basic", { owned: true }));
  drawFortune(g.state, ana, 1); // insured
  assert.equal(ana.equipment.filter((e) => e.owned).length, 1, "insured: the rig is replaced (kept)");
  ok("tool theft: insurance saves the asset");
}

// Mayor's re-election drive: a donation earns you a Favor.
{
  resetIds();
  const dona = { type: "character", id: "reelection_drive", name: "Mayor's re-election drive", effect: "donation", cost: 3 };
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1, fortune: [dona] });
  g.start();
  const ana = g.state.players[0];
  const cash0 = ana.cash;
  g.state.pendingMayor = []; // clear the turn-1 draw
  drawFortune(g.state, ana, 1);
  assert.equal(g.state.pendingMayor.length, 1, "the drive queues a decision");
  g.resolveMayor({ buy: true });
  assert.equal(ana.cash, cash0 - (economy.mayor_favor_cost ?? 10), "donation paid (10 W)");
  assert.ok(ana.hand.some((c) => c.type === "favor"), "earned a Favor card");
  ok("mayor's drive: chip in → a Favor card");
}

// BBB Special gates services; a drawn BBB Special unlocks them; marketing is a few-turn timer.
{
  resetIds();
  const bbb = { type: "bbb_special", id: "bbb_special", name: "BBB Special" };
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1, fortune: [bbb] });
  g.start();
  const ana = g.state.players[0];
  ana.bbbThisTurn = false;
  assert.throws(() => g.buyService("insurance"), /BBB/, "no services without a BBB Special in town");
  drawFortune(g.state, ana, 1); // draws the BBB Special
  assert.ok(ana.bbbThisTurn, "a drawn BBB Special unlocks buying this turn");
  g.buyService("marketing");
  assert.ok(hasModifier(ana, "marketing"), "bought marketing");
  tickModifiers(g.state, ana); tickModifiers(g.state, ana); tickModifiers(g.state, ana);
  assert.ok(!hasModifier(ana, "marketing"), "marketing expires after its few-turn run");
  ok("BBB Special gates services; marketing is a timed run");
}

// Year-end force-settles the line of credit out of cash (no borrowing your way to a win).
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0];
  ana.bbbThisTurn = false;
  g.state.rng = () => 1; // don't let the loan-demand fire in THIS test
  g.drawCredit();
  const withLoan = ana.cash;
  forceSettleCredit(g.state, ana);
  assert.equal(balances(ana)[ACCT.LOC] || 0, 0, "the line of credit is cleared at year-end");
  assert.equal(ana.cash, withLoan - economy.line_of_credit.draw, "borrowed cash is repaid, not counted as winnings");
  ok("year-end settles the line of credit (can't borrow to win)");
}

// The bank can CALL the loan — the deeper you lean on credit, the likelier, closing the
// "borrow forever to outlast the clock" exploit. A called loan is repaid on the spot.
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0]; ana.bbbThisTurn = false;
  g.state.rng = () => 0; // force the demand to fire
  const cash0 = ana.cash;
  g.drawCredit(); // draw 20 → owed 20 → 5% risk → CALLED → repaid in full
  assert.equal(balances(ana)[ACCT.LOC] || 0, 0, "a called loan is repaid in full immediately");
  assert.equal(ana.cash, cash0, "the drawn cash is clawed straight back — no free runway");
  ok("loan demand: leaning on the bank risks the loan being CALLED");
}

console.log(`\nAll modifier checks passed (${passed}).`);
