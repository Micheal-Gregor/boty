// F: a stiffed defect-fix fee is suable. Fixing a code violation routes the fix to a rival
// tradesperson as a player-AP; if you don't pay, the fixer gets a sue window like any other
// player debt. This proves the (already-generic) court path covers it end-to-end.
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();

function drainPending(g) {
  if (g.settleCases.length) g.autoResolveSettle();
  if (g.courtCases.length) g.autoResolveCourt();
  if (g.damagesCases.length) g.autoResolveDamages();
  if (g.poachCases.length) g.autoResolvePoach();
  if (g.mayorCases.length) g.autoResolveMayor();
  if (g.referralCases.length) g.autoResolveReferral();
}

resetIds();
const g = new Game(economy, [{ name: "Debtor", service: "mechanic" }, { name: "Fixer", service: "pipefitter" }], { ...decks, seed: 1, difficulty: "standard" });
g.start();
const debtor = g.state.players[0], fixer = g.state.players[1];

// Debtor has a code violation only a pipefitter can clear.
debtor.defects.push({ id: "DT1", name: "Cracked main", fine: 2, fix_cost: 6, productivity_hit: 2, fix_trade: "pipefitter", fix_terms: 1 });

// Debtor's turn: fix it → routes to the Fixer as a player-AP (the suable debt).
g.fixDefect("DT1");
const ap = debtor.payables.find((a) => a.creditor_id === fixer.id && !a.is_npc);
assert.ok(ap, "fixing a defect routes a player-AP to the fixer");
assert.equal(ap.amount, 6, "the AP is the fix fee");

// Debtor stiffs it → advance until the sue window opens at the debtor's upkeep.
let guard = 0;
while (!(ap.sue_window_remaining > 0) && guard++ < 12) { drainPending(g); g.endTurn(); }
assert.ok(ap.sue_window_remaining > 0, "a sue window opens once the fix fee is past due");

// On the Fixer's turn, they sue the stiffer — the debt is accepted as suable.
while (g.currentPlayer.id !== fixer.id && guard++ < 12) { drainPending(g); g.endTurn(); }
drainPending(g);
const res = g.sue(debtor.id, ap.id, {});
assert.ok(g.state.pendingThreat?.type === "sue", "the fixer can sue the stiffer for the unpaid fix fee");

// Debtor folds → the suit resolves cleanly.
g.respondToThreat({ contest: false });
assert.ok(!g.state.pendingThreat, "the suit resolves");

console.log("✓ defect-fix stiff → routed player-AP → sue window → fixer sues: all wired");
console.log("All defect-sue checks passed (1).");
