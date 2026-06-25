// Word-of-mouth — the four NPC jobs. Dot's good word seeds jobs on completion; Hettrick & Lundgren
// pull jobs if ignored the round drawn; Chief Boon's job is mandatory.

import assert from "node:assert/strict";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { Deck, makeRng } from "../src/engine/deck.js";
import { drawFortune } from "../src/engine/fortune.js";
import * as jobs from "../src/engine/jobs.js";

let passed = 0;
const ok = (l) => { passed++; console.log(`  ✓ ${l}`); };
const economy = await loadEconomy();
const decks = await loadDecks();
function game(trade) {
  resetIds();
  const g = new Game(economy, [{ name: "A", service: trade }], { seed: 1, fortune: decks.fortune });
  g.start();
  g.state.die = () => 1; // force every word-of-mouth trigger to fire — these test the mechanic, not the tier odds
  const p = g.state.players[0];
  p.jobs = []; g.state.pendingPoach = []; g.state.pendingMayor = [];
  return { g, p };
}
const drawNpc = (g, p, npc) => { p.deck = new Deck([{ type: "job", npc, id: "job_" + npc, name: npc }], makeRng(1)); return drawFortune(g.state, p, 1)[0]; };
const plainJobs = (p) => p.deck.source.filter((c) => c.type === "job" && !c.subcontract && !c.political).length;
const countId = (p, id) => p.deck.source.filter((c) => c.id === id).length;

// tailoring
{
  const { g, p } = game("mechanic"); drawNpc(g, p, "hettrick"); const j = p.jobs[0];
  assert.equal(j.npc, "hettrick");
  assert.equal(j.terms, 3, "net-90");
  assert.equal(j.art, "job/hettrick/mechanic");
  assert.match(j.name, /Hettrick/);
  ok("NPC job tailors: npc tag, net-90, per-trade name + art");
}
// Boon is mandatory + undroppable
{
  const { g, p } = game("welder"); drawNpc(g, p, "boon"); const j = p.jobs[0];
  assert.equal(j.droppable, false, "Boon's job can't be dropped");
  assert.equal(g.unstaffedBoon.length, 1, "unstaffed Boon job flagged for the must-assign guard");
  j.assigned_tradesmen.push(p.tradesmen[0].id);
  assert.equal(g.unstaffedBoon.length, 0, "once staffed, no longer blocks");
  ok("Boon: mandatory & undroppable until staffed");
}
// Dot's good word: completing her job seeds +3 j2 jobs
{
  const { g, p } = game("plumber"); drawNpc(g, p, "dot"); const j = p.jobs[0];
  const before = countId(p, "j2");
  jobs.completeNow(g.state, p, j);
  assert.equal(countId(p, "j2"), before + (economy.dot_referral_jobs ?? 3), "Dot seeds +3 jobs");
  ok("Dot: completing her job seeds +3 jobs into your deck");
}
// Hettrick ignored → pulls 2 jobs; worked → no pull
{
  const { g, p } = game("welder");
  const before = plainJobs(p);
  p.jobs.push({ id: "JH", npc: "hettrick", drawn_turn: g.state.turn, assigned_tradesmen: [], state: "Queued", work_amount: 5, work_done: 0, deadline_turn: g.state.turn + 5, max_tradesmen: 2, min_tradesmen: 1, name: "Hettrick", value: 16, terms: 3 });
  g.endTurn();
  assert.equal(plainJobs(p), before - (economy.bad_wom_pull ?? 2), "ignored Hettrick pulled 2 jobs");
  ok("Hettrick: ignored job pulls 2 jobs from your deck (bad word of mouth)");
}
{
  const { g, p } = game("welder");
  const before = plainJobs(p);
  p.jobs.push({ id: "JH", npc: "lundgren", drawn_turn: g.state.turn, assigned_tradesmen: [p.tradesmen[0].id], state: "Active", work_amount: 5, work_done: 0, deadline_turn: g.state.turn + 5, max_tradesmen: 2, min_tradesmen: 1, name: "Lundgren", value: 16, terms: 3 });
  g.endTurn();
  assert.equal(plainJobs(p), before, "worked Lundgren job → no pull");
  ok("Lundgren: a worked job spares your deck");
}

console.log(`\nAll word-of-mouth checks passed (${passed}).`);
