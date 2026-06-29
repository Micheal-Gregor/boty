// Double-entry guardrail for the accrual work. Through full bot games it asserts, every player-turn:
//   1. the books balance (assets = liabilities + equity), and
//   2. the ledger's AP balance equals the sum of that player's OUTSTANDING ACCRUED payables —
//      i.e. every bill booked to AP is later cleared off it (no booked-then-lost liabilities).
// (2) is the check the plain `balanced` invariant CAN'T catch — a missed clearing path leaves a
// lingering AP credit while the entry still balances. This test gates the accrual conversion.
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { balanceSheet, balances, ACCT } from "../src/state/ledger.js";
import { incurPayable, clearPayable } from "../src/engine/payables.js";
import { botActions } from "../tools/bot.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();
let checks = 0, unbalanced = 0, apMismatch = 0, arMismatch = 0;

for (const seed of [7, 19, 42]) {
  resetIds();
  const g = new Game(economy, [{ name: "A", service: "mechanic" }, { name: "B", service: "plumber" }, { name: "C", service: "electrician" }], { ...decks, seed, difficulty: "standard" });
  g.start();
  for (let i = 0; i < 140 && !g.state.over; i++) {
    try { botActions(g, "balanced"); } catch { /* best effort */ }
    g.autoResolveCourt?.(); g.autoResolveSettle?.(); g.autoResolvePoach?.(); g.autoResolveMayor?.(); g.autoResolveReferral?.(); g.autoResolveDamages?.();
    g.endTurn();
    for (const p of g.state.players) {
      if (p.bankrupt) continue; // a folded shop's books are intentionally wiped — not meant to reconcile
      checks++;
      if (!balanceSheet(p).balanced) unbalanced++;
      const ledgerAP = -(balances(p)[ACCT.AP] || 0);
      const accruedAP = (p.payables || []).filter((a) => a.accrued).reduce((s, a) => s + a.amount, 0);
      if (Math.abs(ledgerAP - accruedAP) > 0.001) apMismatch++;
      // AR reconciles to open client invoices PLUS accrued player-debts owed TO this player.
      const ledgerAR = balances(p)[ACCT.AR] || 0;
      const openInv = (p.invoices || []).filter((iv) => !iv.factored).reduce((s, iv) => s + iv.amount, 0);
      const owedToMe = g.state.players.flatMap((x) => x.payables || []).filter((a) => a.accrued && !a.is_npc && a.creditor_id === p.id).reduce((s, a) => s + a.amount, 0);
      if (Math.abs(ledgerAR - (openInv + owedToMe)) > 0.001) arMismatch++;
    }
  }
}

assert.equal(unbalanced, 0, `${unbalanced}/${checks} balance-sheet checks failed (assets ≠ liabilities + equity)`);
assert.equal(apMismatch, 0, `${apMismatch}/${checks} AP reconciliations failed (ledger AP ≠ outstanding accrued payables)`);
assert.equal(arMismatch, 0, `${arMismatch}/${checks} AR reconciliations failed (ledger AR ≠ open invoices + accrued player debts owed to you)`);
console.log(`  ✓ ${checks} player-turns: books balanced; AP & AR both reconcile`);

// Targeted: a player debt books BOTH sides at incur and clears BOTH on payment.
{
  resetIds();
  const g = new Game(economy, [{ name: "GC", service: "plumber" }, { name: "Sub", service: "electrician" }], { ...decks, fortune: [], seed: 1 });
  g.start();
  const [gc, sub] = g.state.players;
  const apLiab = (p) => Math.abs(balances(p)[ACCT.AP] || 0); // AP credit-balance magnitude
  const arBal = (p) => Math.abs(balances(p)[ACCT.AR] || 0);
  incurPayable(g.state, gc, { vendor: "Sub work", amount: 6, dueTurn: g.state.turn + 1, isNpc: false, creditorId: sub.id, debits: [{ acct: ACCT.COGS_SUB, amt: 6 }] });
  assert.equal(apLiab(gc), 6, "incur: GC books Dr COGS-Sub / Cr AP (AP = 6)");
  assert.equal(arBal(sub), 6, "incur: Sub books Dr AR / Cr Revenue (AR = 6)");
  clearPayable(g.state, gc, gc.payables[0], { cashAmt: 6, reason: "Paid" });
  assert.equal(apLiab(gc), 0, "pay: GC's AP cleared (Dr AP / Cr Cash)");
  assert.equal(arBal(sub), 0, "pay: Sub's AR collected (Dr Cash / Cr AR)");
  console.log("  ✓ player debt: both sides book at incur and clear on payment");
}
console.log("All accrual guardrail checks passed (2).");
