// Build-A balance gates (the contract). Routing must not reward dishonesty or kingmaking:
//   Gate 1 — a dodge-the-subs GC must NOT out-earn a pay-on-time GC (same seat, paired games).
//   Gate 2 — commission-follows-players: a routed contract with no solvent subs pays LESS (bank
//            covers the portions at no markup), so bankrupting your subs shrinks your own income.
// Exits 1 if either gate fails. Run:  node tools/routed-gate.mjs [games]

import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { botActions } from "./bot.js";
import { resetIds } from "../src/state/state.js";
import { startRouted } from "../src/engine/routed.js";

const economy = await loadEconomy();
const decks = await loadDecks();
const S = economy.services;
const N = parseInt(process.argv[2], 10) || 200;

function runToEnd(g, dodgeSeat) {
  let ctx = g.start();
  let guard = 0;
  while (!ctx.over && guard++ < 700) {
    if (ctx.reckoning) { g.closeBooks(); break; }
    if (g.settleCases.length) g.autoResolveSettle();
    if (g.courtCases.length) g.autoResolveCourt();
    if (g.damagesCases.length) g.autoResolveDamages();
    if (g.poachCases.length) g.autoResolvePoach();
    if (g.mayorCases.length) g.autoResolveMayor();
    if (g.referralCases.length) g.autoResolveReferral();
    if (ctx.canAct) botActions(g, "balanced", { dodge: g.state.activePlayerIndex === dodgeSeat });
    ctx = g.endTurn();
  }
  return g.state.players.map((p) => p.cash);
}
function game(seed) {
  resetIds();
  const seeds = Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, service: S[i % S.length] }));
  return new Game(economy, seeds, { ...decks, seed, difficulty: "standard" });
}

// ── Gate 1: seat 0 plays the SAME game twice — once dodging its subs, once paying them. ──
let dodgeSum = 0, paySum = 0, dodgeBetter = 0;
for (let s = 1; s <= N; s++) {
  const dodge = runToEnd(game(s), 0)[0]; // seat 0 dodges
  const pay = runToEnd(game(s), -1)[0]; // seat 0 pays (no dodger)
  dodgeSum += dodge; paySum += pay;
  if (dodge > pay) dodgeBetter++;
}
const dodgeAvg = dodgeSum / N, payAvg = paySum / N;
console.log(`\n=== Gate 1 — dodge vs pay (seat 0, N=${N} paired games) ===`);
console.log(`  dodging subs : avg ${dodgeAvg.toFixed(1)}W   (out-earned in ${dodgeBetter}/${N} games)`);
console.log(`  paying subs  : avg ${payAvg.toFixed(1)}W`);
const gate1 = dodgeAvg <= payAvg * 1.03; // dodging must not beat honesty (3% noise tolerance)
console.log(gate1 ? "  ✅ crime doesn't pay — dodging ≤ honest" : "  ❌ FAIL — dodging out-earns paying; nerf the walk/collectibility");

// ── Gate 2: a routed contract with no solvent subs pays less than one routed to players. ──
const CARD = { id: "rt_g", name: "Gate contract", required_trades: [S[1], S[2], S[4]], sub_value: 6, markup: 2, deadline: 6 };
function clientValue(bankrupt) {
  resetIds();
  const g = new Game(economy, [{ name: "GC", service: S[0] }, { name: "A", service: S[1] }, { name: "B", service: S[2] }, { name: "C", service: S[4] }], { ...decks, seed: 1, difficulty: "standard" });
  g.start();
  if (bankrupt) for (const p of g.state.players.slice(1)) p.bankrupt = true; // subs gone → bank covers
  startRouted(g.state, g.state.players[0], CARD);
  return g.state.routed[0]?.client_value ?? g.state.players[0].invoices.at(-1)?.amount ?? 0;
}
const withSubs = clientValue(false), noSubs = clientValue(true);
console.log(`\n=== Gate 2 — commission follows players ===`);
console.log(`  routed to players : client bills ${withSubs}W (base + markup)`);
console.log(`  subs bankrupt     : client bills ${noSubs}W (bank covers, no markup)`);
const gate2 = noSubs < withSubs;
console.log(gate2 ? "  ✅ bankrupting your subs shrinks your routed income" : "  ❌ FAIL — no penalty for a dead table");

if (!gate1 || !gate2) process.exitCode = 1;
console.log(`\n${gate1 && gate2 ? "✅ both A gates pass." : "❌ A gates FAILED."}`);
