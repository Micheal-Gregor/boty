// Ledger test — the G/L must always balance and reconcile to cash, and the P&L must sum from it.

import assert from "node:assert/strict";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { botActions } from "../tools/bot.js";
import { profitAndLoss, balances, ACCT } from "../src/state/ledger.js";

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
    if (ctx.canAct) botActions(g, "balanced");
    ctx = g.endTurn();
  }
  const pl = profitAndLoss(g.state.players[0]);
  assert.equal(pl.grossMargin, pl.revenue - pl.cogs, "gross margin = revenue − COGS");
  assert.equal(pl.netIncome, pl.revenue - pl.cogs - pl.overhead, "net income = revenue − COGS − overhead");
  assert.ok(pl.revenue > 0, "a real game booked some revenue");
  assert.ok(pl.overhead > 0, "a real game booked some overhead (rent/wages)");
  ok(`P&L sums from the ledger (rev ${pl.revenue} − COGS ${pl.cogs} − OH ${pl.overhead} = net ${pl.netIncome})`);
}

console.log(`\nAll ledger checks passed (${passed}).`);
