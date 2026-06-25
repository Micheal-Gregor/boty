// Stage 5 tuning harness. Simulates many seeded games with the heuristic bots (tools/bot.js):
//   (A) an economy-health read using the balanced bot, and
//   (B) an equipment-specialist vs labor-shop head-to-head — the real instrument for Dial 3,
//       run both WITH and WITHOUT the count-scaling cards to isolate their effect.
// No engine changes happen in Stage 5 — you read these numbers and re-tune the data files.
//
// Usage: node tools/tune.js [games] [players]   (npm run tune)

import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { botActions } from "./bot.js";

const GAMES = parseInt(process.argv[2], 10) || 200;
const PLAYERS = parseInt(process.argv[3], 10) || 4;
const DIFFICULTY = process.argv[4] || "standard"; // steady | standard | cutthroat

const economy = await loadEconomy();
const decks = await loadDecks();
const S = economy.services;
const pct = (x) => `${(x * 100).toFixed(0)}%`;
const f1 = (x) => x.toFixed(1);
const occurrences = (s, needle) => s.split(needle).length - 1;

function runToEnd(game, strategyFor) {
  let ctx = game.start();
  let guard = 0;
  while (!ctx.over && guard++ < 500) {
    if (ctx.reckoning) { game.closeBooks(); break; } // bots don't take last licks; just settle AR
    if (game.settleCases.length) game.autoResolveSettle(); // take affordable settlement offers
    if (game.courtCases.length) game.autoResolveCourt(); // resolve NPC court before acting
    if (game.damagesCases.length) game.autoResolveDamages(); // sue botched routed jobs
    if (game.poachCases.length) game.autoResolvePoach(); // counter-offer or let a poached worker go
    if (game.mayorCases.length) game.autoResolveMayor(); // chip in to the Mayor's drive if flush
    if (game.referralCases.length) game.autoResolveReferral(); // take a brokered job if there's crew to spare
    if (ctx.canAct) botActions(game, strategyFor(game.currentPlayer));
    ctx = game.endTurn();
  }
  return game.state;
}

// --- (A) Economy health (balanced bot) ---------------------------------------------------

function healthGame(seed) {
  const seeds = Array.from({ length: PLAYERS }, (_, i) => ({ name: `P${i + 1}`, service: S[i % S.length] }));
  const state = runToEnd(new Game(economy, seeds, { ...decks, seed, difficulty: DIFFICULTY }), () => "balanced");
  const cashes = state.players.map((p) => p.cash);
  const survivors = state.players.filter((p) => !p.bankrupt);
  const log = state.log.join("\n");
  return {
    bankrupts: state.players.filter((p) => p.bankrupt).length,
    winnerCash: survivors.length ? Math.max(...survivors.map((p) => p.cash)) : Math.max(...cashes),
    spread: Math.max(...cashes) - Math.min(...cashes),
    completed: occurrences(log, "completed "),
    lost: occurrences(log, "no pay") + occurrences(log, "lost in court"),
    shocks: occurrences(log, "⚡"),
  };
}

function health() {
  const rows = Array.from({ length: GAMES }, (_, i) => healthGame(i + 1));
  const avg = (f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
  return {
    bankruptcyRate: rows.filter((r) => r.bankrupts > 0).length / rows.length,
    avgBankrupts: avg((r) => r.bankrupts),
    avgWinnerCash: avg((r) => r.winnerCash),
    avgSpread: avg((r) => r.spread),
    successRate: rows.reduce((s, r) => s + r.completed, 0) / Math.max(1, rows.reduce((s, r) => s + r.completed + r.lost, 0)),
    avgShocks: avg((r) => r.shocks),
  };
}

// --- (B) Equipment specialist vs labor shop (Dial 3) -------------------------------------

function headToHead(seed, fortune) {
  const seeds = [{ name: "Equip", service: S[0] }, { name: "Labor", service: S[1] }];
  const state = runToEnd(
    new Game(economy, seeds, { fortune, jobprogress: decks.jobprogress, civil: decks.civil, seed }),
    (p) => (p.name === "Equip" ? "equipment" : "labor"),
  );
  const [eq, lab] = state.players;
  const eqWins = !eq.bankrupt && (lab.bankrupt || eq.cash > lab.cash);
  return { eqWins, eqCash: eq.cash, labCash: lab.cash };
}

function duel(fortune) {
  const rows = Array.from({ length: GAMES }, (_, i) => headToHead(i + 1, fortune));
  const avg = (f) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
  return { eqWinRate: rows.filter((r) => r.eqWins).length / rows.length, eqCash: avg((r) => r.eqCash), labCash: avg((r) => r.labCash) };
}

const isScaling = (c) => c.per_equipment || c.per_tradesman || c.type === "retirement";
const strippedFortune = decks.fortune.filter((c) => !isScaling(c));

// --- Report ------------------------------------------------------------------------------

console.log(`\nOrder to Cash — tuning harness   (${GAMES} games × ${economy.max_turns} turns · ${DIFFICULTY})\n`);

const h = health();
console.log(`A) Economy health — ${PLAYERS} players, balanced bot`);
const hp = [
  ["bankruptcy rate (any)", pct(h.bankruptcyRate)],
  ["avg bankrupts/game", f1(h.avgBankrupts)],
  ["avg winner cash (W)", f1(h.avgWinnerCash)],
  ["avg cash spread (W)", f1(h.avgSpread)],
  ["job success rate", pct(h.successRate)],
  ["shocks drawn/game", f1(h.avgShocks)],
];
const w0 = Math.max(...hp.map((r) => r[0].length));
for (const [a, b] of hp) console.log(`   ${a.padEnd(w0)}  ${b.padStart(6)}`);

console.log(`\nB) Equipment specialist vs labor shop — 2-player duel (Dial 3)`);
const withCards = duel(decks.fortune);
const without = duel(strippedFortune);
const fmt = (d) => `equip wins ${pct(d.eqWinRate).padStart(4)}  |  avg cash  equip ${f1(d.eqCash).padStart(5)}  labor ${f1(d.labCash).padStart(5)}`;
console.log(`   without count-scaling cards:  ${fmt(without)}`);
console.log(`   with    count-scaling cards:  ${fmt(withCards)}`);
const shift = (withCards.eqWinRate - without.eqWinRate) * 100;
console.log(`   → the cards shift the equipment specialist's win rate by ${shift >= 0 ? "+" : ""}${shift.toFixed(0)} points`);

// --- Read the dials ----------------------------------------------------------------------
console.log(`\nReading the dials:`);
const notes = [];
if (h.bankruptcyRate < 0.1) notes.push("• Nobody feels broke → raise overhead/wages or lower job values (Dials 1–2).");
if (h.bankruptcyRate > 0.85) notes.push("• Famine very harsh → soften shocks or raise job values (Dials 1–2).");
if (h.successRate > 0.9) notes.push("• Jobs almost always succeed → raise negative/decisive shares (Dial 4).");
if (h.avgSpread > h.avgWinnerCash) notes.push("• Large cash spread → a leader may be running away (Dial 1 draw cap).");
if (withCards.eqWinRate >= 0.45 && withCards.eqWinRate <= 0.55) notes.push("• Equipment vs labor is balanced (45–55%) — the build choice stays live. ✓ (Dial 3)");
else if (withCards.eqWinRate < 0.45) notes.push(`• Labor still dominates (equip ${pct(withCards.eqWinRate)}) → strengthen per_equipment / harshen per_tradesman (Dial 3).`);
else notes.push(`• Equipment now dominates (equip ${pct(withCards.eqWinRate)}) → ease the count-scaling tilt (Dial 3).`);
console.log(notes.map((n) => "  " + n).join("\n") + "\n");
