// Employment relations — per-worker performance reviews and the four firing scenarios. The FIRING
// PLAYER rolls; here we feed the die a fixed queue so every wrongful-termination path is exact.

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { classifyTermination, fireWorker, performanceReview, unionActive } from "../src/engine/employment.js";
import { workerProductivity } from "../src/engine/jobs.js";
import { applyGlobal } from "../src/engine/globals.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };
const economy = await loadEconomy();
const base = economy.base_hand_speed;
const T = economy.termination;

// A shop with N healthy, tool-less, unflagged workers and a controllable die.
function shop(workers = 1, rolls = []) {
  resetIds();
  const g = new Game(economy, [{ name: "A", service: "mechanic" }], { seed: 1 });
  g.start();
  const p = g.state.players[0];
  p.jobs = []; p.equipment = []; p.cash = 100;
  p.tradesmen = [];
  for (let i = 0; i < workers; i++) p.tradesmen.push({ id: `W${i}`, assignedJob: null, out_until: null, prod_mod: 0, flag: null });
  const queue = [...rolls];
  g.state.die = () => (queue.length ? queue.shift() : 1);
  return { g, p, st: g.state };
}
const cashOf = (p) => p.cash;

// --- Per-worker productivity from reviews ------------------------------------------------------
{
  const { p } = shop(1);
  const id = p.tradesmen[0].id;
  p.tradesmen[0].prod_mod = 1;
  assert.equal(workerProductivity(economy, p, id), base + 1);
  ok("a +1 review raises a worker's output");

  p.tradesmen[0].prod_mod = -1;
  assert.equal(workerProductivity(economy, p, id), Math.max(0, base - 1));
  ok("a −1 review lowers it, floored at 0 (a poor bare-handed worker spins their wheels)");
}

// --- The four classifications ------------------------------------------------------------------
{
  const { p, st } = shop(1);
  const t = p.tradesmen[0];
  assert.equal(classifyTermination(st, p, t).kind, "legit");
  ok("classify: healthy, unflagged, no work → legit (no claim)");

  t.flag = "theft";
  assert.deepEqual([classifyTermination(st, p, t).kind, classifyTermination(st, p, t).threshold], ["with cause", T.cause]);
  ok("classify: a flagged worker → with cause (safest)");

  t.flag = null; t.out_until = st.turn + 2;
  assert.deepEqual([classifyTermination(st, p, t).kind, classifyTermination(st, p, t).threshold], ["punitive", T.punitive]);
  ok("classify: firing someone out sick → punitive (riskiest)");

  t.out_until = null; p.jobs = [{ id: "J", state: "Queued" }];
  assert.deepEqual([classifyTermination(st, p, t).kind, classifyTermination(st, p, t).threshold], ["no cause", T.nocause]);
  ok("classify: laying off with work still on the books → no cause");

  t.flag = "theft"; t.out_until = st.turn + 2; // grounds win over the sick-timing penalty
  assert.equal(classifyTermination(st, p, t).kind, "with cause");
  ok("classify: grounds outrank the punitive timing");
}

// --- The wrongful-termination dice -------------------------------------------------------------
{
  const { p, st } = shop(1); // healthy, no work → legit
  const before = cashOf(p);
  fireWorker(st, p, p.tradesmen[0].id);
  assert.equal(p.tradesmen.length, 0);
  assert.equal(cashOf(p), before, "a clean layoff costs nothing");
  ok("fire (legit): worker gone, no roll, no cost");
}
{
  const { p, st } = shop(1, [1, 1]); // sues (1≤2) then wins (1≤2)
  p.tradesmen[0].flag = "theft";
  const before = cashOf(p);
  fireWorker(st, p, p.tradesmen[0].id);
  assert.equal(before - cashOf(p), T.award + T.court_fee, "pays award + court fee");
  ok("fire (with cause): sued and won → award + fee");
}
{
  const { p, st } = shop(1, [2, 3]); // sues (2≤2) then loses (3>2)
  p.tradesmen[0].flag = "theft";
  const before = cashOf(p);
  fireWorker(st, p, p.tradesmen[0].id);
  assert.equal(before - cashOf(p), T.court_fee, "only the court fee");
  ok("fire (with cause): sued but lost → just the fee");
}
{
  const { p, st } = shop(1, [3]); // 3 > cause(2) → no suit
  p.tradesmen[0].flag = "theft";
  const before = cashOf(p);
  fireWorker(st, p, p.tradesmen[0].id);
  assert.equal(cashOf(p), before, "no suit, no cost");
  ok("fire (with cause): high roll → they let it go");
}

// --- Union raises the bar; your lawyer lowers it -----------------------------------------------
{
  const { p, st } = shop(1, [4, 6]); // cause(2) → 4 wouldn't sue; +union(2)=4 → 4≤4 sues, 6 loses
  p.tradesmen[0].flag = "theft";
  applyGlobal(st, { name: "Union", kind: "union", magnitude: 0, turns: 99 });
  assert.equal(unionActive(st), true);
  const before = cashOf(p);
  fireWorker(st, p, p.tradesmen[0].id);
  assert.equal(before - cashOf(p), T.court_fee, "a union turns a safe roll into a suit");
  ok("union (+2): a firing that would've been safe now draws a suit");
}
{
  const { p, st } = shop(1, [2]); // nocause(3) → 2 would sue; −lawyer(2)=1 → 2>1 no suit
  p.jobs = [{ id: "J", state: "Active" }];
  const before = cashOf(p);
  fireWorker(st, p, p.tradesmen[0].id, { ownLawyer: true });
  assert.equal(cashOf(p), before, "your lawyer narrows their window");
  ok("slick lawyer (−2): shifts the odds in your favour");
}

// --- Performance reviews set per-worker output + flags -----------------------------------------
{
  const { p, st } = shop(3, [1, 3, 5]); // poor, steady, standout
  const lines = performanceReview(st, p);
  assert.equal(p.tradesmen[0].prod_mod, -1);
  assert.equal(p.tradesmen[0].flag, "poor_review");
  assert.equal(p.tradesmen[1].prod_mod, 0);
  assert.equal(p.tradesmen[2].prod_mod, 1);
  assert.equal(lines.length, 3);
  ok("review: 1–2 poor (−1, flagged), 3–4 steady, 5–6 standout (+1)");

  // a later good review clears the stale poor flag
  st.die = () => 4;
  performanceReview(st, p);
  assert.equal(p.tradesmen[0].flag, null);
  ok("review: a recovered worker sheds the poor-review flag");
}

console.log(`\nAll employment checks passed (${passed}).`);
