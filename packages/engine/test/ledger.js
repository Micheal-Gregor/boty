// Ledger test — the G/L must always balance and reconcile to cash, and the P&L must sum from it.

import assert from "node:assert/strict";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { botActions } from "../tools/bot.js";
import { resetIds } from "../src/state/state.js";
import { profitAndLoss, balanceSheet, balances, ACCT } from "../src/state/ledger.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };

const economy = await loadEconomy();
const decks = await loadDecks();
const S = economy.services;

// Every journal entry balances (debits = credits) — a structural invariant.
{
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  let ctx = g.start();
  let guard = 0;
  while (!ctx.over && guard++ < 500) {
    if (ctx.reckoning) { g.closeBooks(); break; }
    if (g.settleCases.length) g.autoResolveSettle();
    if (g.courtCases.length) g.autoResolveCourt();
    if (g.damagesCases.length) g.autoResolveDamages();
    if (g.poachCases.length) g.autoResolvePoach();
    if (g.mayorCases.length) g.autoResolveMayor();
    if (g.referralCases.length) g.autoResolveReferral();
    if (ctx.canAct) botActions(g, "balanced");
    ctx = g.endTurn();
  }
  for (const p of g.state.players) {
    for (const je of p.ledger) {
      const net = je.lines.reduce((s, l) => s + l.amt, 0);
      assert.ok(Math.abs(net) < 0.001, `JE "${je.memo}" balances`);
    }
  }
  ok("every journal entry balances (debits = credits) across a full solo game");

  // Cash on the books = the net of all account-1000 lines.
  const p = g.state.players[0];
  const ledgerCash = balances(p)[ACCT.CASH];
  assert.equal(p.cash, ledgerCash, "player.cash reconciles to the ledger's cash account");
  ok("cash reconciles to the general ledger");
}

// The P&L sums revenue / COGS / overhead from the ledger, and the accounting identity holds.
{
  const seeds = S.map((s, i) => ({ name: `P${i + 1}`, service: s }));
  const g = new Game(economy, seeds, { ...decks, seed: 7 });
  let ctx = g.start();
  let guard = 0;
  while (!ctx.over && guard++ < 500) {
    if (ctx.reckoning) { g.closeBooks(); break; }
    if (g.settleCases.length) g.autoResolveSettle();
    if (g.courtCases.length) g.autoResolveCourt();
    if (g.damagesCases.length) g.autoResolveDamages();
    if (g.poachCases.length) g.autoResolvePoach();
    if (g.mayorCases.length) g.autoResolveMayor();
    if (g.referralCases.length) g.autoResolveReferral();
    if (ctx.canAct) botActions(g, "balanced");
    ctx = g.endTurn();
  }
  const pl = profitAndLoss(g.state.players[0]);
  assert.equal(pl.grossMargin, pl.revenue - pl.cogs, "gross margin = revenue − COGS");
  assert.equal(pl.netIncome, pl.revenue - pl.cogs - pl.overhead, "net income = revenue − COGS − overhead");
  assert.ok(pl.revenue > 0, "a real game booked some revenue");
  assert.ok(pl.overhead > 0, "a real game booked some overhead (rent/wages)");
  ok(`P&L sums from the ledger (rev ${pl.revenue} − COGS ${pl.cogs} − OH ${pl.overhead} = net ${pl.netIncome})`);

  for (const p of g.state.players) assert.ok(balanceSheet(p).balanced, `${p.name}'s balance sheet balances`);
  ok("balance sheet balances (Assets = Liabilities + Equity) for every player");
}

// Self-work CAPITALISES to the balance sheet (account 1600), never the P&L.
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0];
  const { cost, capacity } = economy.shop_improvement;
  const netBefore = profitAndLoss(ana).netIncome;
  const cashBefore = ana.cash;
  ana.bbbThisTurn = true;
  g.improveShop();
  assert.equal(ana.cash, cashBefore - cost, "cash paid for the improvement");
  assert.equal(ana.capacityBonus, capacity, "capacity bonus added");
  assert.equal(profitAndLoss(ana).netIncome, netBefore, "a capital improvement does NOT touch the P&L");
  const bs = balanceSheet(ana);
  assert.ok(bs.balanced, "balance sheet still balances after capitalising");
  assert.ok(bs.assetLines.some((l) => l.acct === ACCT.BUILDING && l.amount === cost), "the building asset shows on the balance sheet");
  // Relocating writes the leasehold improvement off (a loss to the P&L).
  g.relocate("shop");
  assert.equal(ana.capacityBonus, 0, "improvements (and their capacity) are lost on relocate");
  assert.equal(balances(ana)[ACCT.BUILDING] ?? 0, 0, "the building asset is written off when you move");
  ok("self-work capitalises to 1600 (balance sheet, not P&L); written off on relocate");
}

console.log(`\nAll ledger checks passed (${passed}).`);
