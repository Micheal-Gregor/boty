// Difficulty tiers (Stage 8): word-of-mouth odds + the starting-cash modifier per tier.

import assert from "node:assert/strict";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { womFires } from "../src/engine/livingdeck.js";

let passed = 0;
const ok = (l) => { passed++; console.log(`  ✓ ${l}`); };
const economy = await loadEconomy();
const decks = await loadDecks();

// womFires rolls a d6 ≤ the tier's threshold for that NPC.
const st = (difficulty, dieVal) => ({ economy, difficulty, die: () => dieVal });
{
  // steady: Dot threshold 6 (always helps), Hettrick threshold 2 (rarely bites)
  assert.ok(womFires(st("steady", 6), "dot"), "steady Dot fires at 6");
  assert.ok(womFires(st("steady", 1), "dot"), "steady Dot fires at 1");
  assert.ok(!womFires(st("steady", 3), "hettrick"), "steady Hettrick silent at 3 (>2)");
  assert.ok(womFires(st("steady", 2), "hettrick"), "steady Hettrick bites at 2 (≤2)");
  ok("steady: Dot almost always helps, Hettrick rarely bites");
}
{
  // cutthroat: Dot threshold 2 (rarely helps), Hettrick threshold 6 (always bites)
  assert.ok(!womFires(st("cutthroat", 5), "dot"), "cutthroat Dot silent at 5 (>2)");
  assert.ok(womFires(st("cutthroat", 6), "hettrick"), "cutthroat Hettrick bites at 6");
  assert.ok(womFires(st("cutthroat", 1), "lundgren"), "cutthroat Lundgren bites at 1");
  ok("cutthroat: Dot dries up, Hettrick & Lundgren always remember");
}
{
  // an unconfigured trigger (no threshold) always fires — back-compat with the single-player tests
  assert.ok(womFires(st("standard", 6), "boon"), "unconfigured npc always fires");
  assert.ok(womFires({ economy, die: () => 1 }, "dot"), "no tier on state → standard fallback (fires at 1)");
  assert.ok(!womFires({ economy, die: () => 6 }, "dot"), "...and standard gates Dot at 4 (6 stays silent)");
  ok("unconfigured trigger → always fires; missing tier → standard fallback");
}
{
  // cash modifier: steady opens with more runway than cutthroat, ledger stays balanced
  resetIds();
  const gS = new Game(economy, [{ name: "A", service: "mechanic" }], { ...decks, seed: 1, difficulty: "steady" }); gS.start();
  resetIds();
  const gC = new Game(economy, [{ name: "A", service: "mechanic" }], { ...decks, seed: 1, difficulty: "cutthroat" }); gC.start();
  const tiers = economy.difficulty_tiers;
  const gap = gS.state.players[0].cash - gC.state.players[0].cash;
  assert.equal(gap, tiers.steady.cash_mod - tiers.cutthroat.cash_mod, "steady vs cutthroat opening-cash gap matches the tier dials");
  const sum = gS.state.players[0].ledger[0].lines.reduce((a, l) => a + l.amt, 0);
  assert.equal(sum, 0, "opening ledger stays balanced after the cash modifier");
  assert.equal(gS.state.difficulty, "steady", "tier name recorded on state");
  ok("cash modifier: steady starts richer than cutthroat, books still balance");
}

console.log(`\nAll difficulty checks passed (${passed}).`);
