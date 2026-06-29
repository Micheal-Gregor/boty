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
import { botActions } from "../tools/bot.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();
let checks = 0, unbalanced = 0, apMismatch = 0;

for (const seed of [7, 19, 42]) {
  resetIds();
  const g = new Game(economy, [{ name: "A", service: "mechanic" }, { name: "B", service: "plumber" }, { name: "C", service: "electrician" }], { ...decks, seed, difficulty: "standard" });
  g.start();
  for (let i = 0; i < 140 && !g.state.over; i++) {
    try { botActions(g, "balanced"); } catch { /* best effort */ }
    g.autoResolveCourt?.(); g.autoResolveSettle?.(); g.autoResolvePoach?.(); g.autoResolveMayor?.(); g.autoResolveReferral?.(); g.autoResolveDamages?.();
    g.endTurn();
    for (const p of g.state.players) {
      checks++;
      if (!balanceSheet(p).balanced) unbalanced++;
      const ledgerAP = -(balances(p)[ACCT.AP] || 0);
      const accruedAP = (p.payables || []).filter((a) => a.accrued).reduce((s, a) => s + a.amount, 0);
      if (Math.abs(ledgerAP - accruedAP) > 0.001) apMismatch++;
    }
  }
}

assert.equal(unbalanced, 0, `${unbalanced}/${checks} balance-sheet checks failed (assets ≠ liabilities + equity)`);
assert.equal(apMismatch, 0, `${apMismatch}/${checks} AP reconciliations failed (ledger AP ≠ outstanding accrued payables)`);
console.log(`  ✓ ${checks} player-turns: books balanced AND AP reconciles to accrued payables`);
console.log("All accrual guardrail checks passed (1).");
