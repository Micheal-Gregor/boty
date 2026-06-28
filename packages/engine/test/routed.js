// Build A — routed 3-trade GC contracts. The drawer routes portions to the trade-players (owing
// each a net-30 AP), does any portion of their own trade, and bills the client ONE net-90 invoice
// only when every portion lands. A botched portion collapses the whole contract (no client AR).
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { resolveCard } from "../src/engine/fortune.js";
import * as jobs from "../src/engine/jobs.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();
const CARD = { type: "routed", id: "rt_test", name: "Town hall reno", required_trades: ["plumber", "electrician", "welder"], sub_value: 6, markup: 2, deadline: 6 };

function game(gcTrade) {
  resetIds();
  const g = new Game(economy, [{ name: "GC", service: gcTrade }, { name: "P", service: "plumber" }, { name: "E", service: "electrician" }, { name: "W", service: "welder" }], { ...decks, jobprogress: [], seed: 1, difficulty: "standard" });
  g.start();
  for (const pl of g.state.players) pl.tradesmen.push({ id: `T_${pl.name}`, prod_mod: 0, flag: null, assignedJob: null, out_until: null, tool: null });
  return g;
}
function deliver(g, pl) {
  const j = pl.jobs.find((x) => x.routed_id);
  jobs.assign(g.state, pl, j.id);
  j.work_done = j.work_amount;
  jobs.runJobProgress(g.state, pl);
}
let n = 0; const ok = (m) => { n++; console.log(`  ✓ ${m}`); };

// (1) GC holds none of the 3 trades → routes all three.
{
  const g = game("mechanic");
  const [gc, p, e, w] = g.state.players;
  resolveCard(g.state, gc, CARD);
  assert.equal(g.state.routed.length, 1, "contract in flight");
  assert.equal(gc.payables.filter((a) => !a.is_npc).length, 3, "GC owes 3 sub-APs");
  assert.ok(gc.payables.every((a) => a.is_npc || a.pending), "sub-APs pending until delivery");
  assert.equal(p.jobs.filter((j) => j.routed_id).length, 1, "each sub holds their portion");
  ok("routes all 3 portions; 3 pending sub-APs");

  deliver(g, p); deliver(g, e); deliver(g, w);
  assert.equal(g.state.routed.length, 0, "contract clears when all land");
  const inv = gc.invoices.find((i) => i.amount === 24); // 3 × (6 base + 2 markup)
  assert.ok(inv, "GC bills the client 24W");
  const due = gc.payables.filter((a) => !a.is_npc && !a.pending);
  assert.equal(due.length, 3, "all 3 sub-APs came due on delivery");
  assert.ok(inv.due_turn > due[0].due_turn, "client AR (net-90) lands AFTER the sub-APs (net-30)");
  ok("all delivered → client AR 24W net-90, after the 6W net-30 sub-APs");
}

// (2) GC holds one of the trades → does that portion (no AP), routes the other two.
{
  const g = game("plumber");
  const [gc] = g.state.players;
  resolveCard(g.state, gc, CARD);
  assert.equal(gc.payables.filter((a) => !a.is_npc).length, 2, "GC owes only 2 sub-APs (does the plumber part)");
  assert.equal(gc.jobs.filter((j) => j.routed_id).length, 1, "GC holds their own portion");
  ok("GC does their trade's portion → only 2 sub-APs");
}

// (3) A portion is botched → the whole contract collapses, no client AR.
{
  const g = game("mechanic");
  const [gc, p, e, w] = g.state.players;
  resolveCard(g.state, gc, CARD);
  deliver(g, p); deliver(g, e); // welder never delivers
  const wj = w.jobs.find((j) => j.routed_id);
  wj.state = "Expired";
  jobs.runJobProgress(g.state, w); // trigger the expiry/botch path
  // Force the botch resolution directly (the welder's portion fell through):
  const { onRoutedPortionBotch } = await import("../src/engine/routed.js");
  onRoutedPortionBotch(g.state, wj);
  assert.equal(g.state.routed.length, 0, "the collapsed contract is removed");
  assert.ok(!gc.invoices.some((i) => i.amount === 24), "no client AR on collapse");
  ok("a botched portion collapses the contract — no client payment");
}

console.log(`All routed checks passed (${n}).`);
