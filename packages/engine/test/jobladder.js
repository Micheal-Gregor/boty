// The tailored job ladder — a generic j1–j6 card skins to the drawer's trade: per-trade name,
// the size's stats, the right art key, and always the drawer's own job (no routing).

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { Deck, makeRng } from "../src/engine/deck.js";
import { drawFortune } from "../src/engine/fortune.js";

let passed = 0;
const ok = (l) => { passed++; console.log(`  ✓ ${l}`); };
const economy = await loadEconomy();

function drawSize(trade, size) {
  resetIds();
  const g = new Game(economy, [{ name: "A", service: trade }], { seed: 1 });
  g.start();
  const p = g.state.players[0];
  p.jobs = [];
  p.deck = new Deck([{ type: "job", size, id: size, name: "Job" }], makeRng(1));
  const summary = drawFortune(g.state, p, 1)[0];
  return { job: p.jobs[0], summary };
}

// stats come from the size config, identically for any trade
{
  const { job } = drawSize("mechanic", "j4");
  const sz = economy.job_sizes.j4;
  assert.equal(job.value, sz.value);
  assert.equal(job.max_tradesmen, sz.crew);
  assert.equal(job.required_equipment, "pro");
  assert.equal(job.required_trade, null, "tailored jobs are the drawer's own — no routing");
  ok("ladder: a j4 carries the size's value/crew/gear, no trade gate");
}
{
  const a = drawSize("mechanic", "j5").job;
  const b = drawSize("welder", "j5").job;
  assert.equal(a.value, b.value, "same size → same value for every trade (equal access)");
  assert.equal(a.required_building_tier, 2);
  assert.equal(a.equipment_per_tradesman, true);
  ok("ladder: j5 pays the same for mechanic and welder; needs tier-2 + geared crew");
}

// per-trade name + art
{
  const { job, summary } = drawSize("mechanic", "j4");
  assert.equal(job.name, "Engine rebuild", "mechanic j4 name");
  assert.equal(job.art, "job/j4/mechanic");
  assert.equal(summary.art, "job/j4/mechanic", "summary carries the art for the card popup");
  ok("ladder: j4 skins to the trade's name + per-trade art key");
}
{
  const { job } = drawSize("welder", "j1");
  assert.equal(job.name, "Railing weld", "welder j1 name");
  assert.equal(job.art, "job/walkin/1p", "j1–j3 use the generic walk-in art");
  ok("ladder: j1 skins to the trade's name + the walk-in art");
}

console.log(`\nAll job-ladder checks passed (${passed}).`);
