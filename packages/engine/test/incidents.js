// Building-incident test (Build E) — incidents are "light civics": a tender per trade to the
// matching player (NPC-paid), the drawer is a mini-PM who takes a small fee when all land, and may
// sue a contractor who stalls (losing the fee). No town-wide levy.
import assert from "node:assert/strict";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { applyIncident, onIncidentTenderBotch } from "../src/engine/incidents.js";
import * as jobs from "../src/engine/jobs.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };
const economy = await loadEconomy();
const decks = await loadDecks();
const CARD = { type: "incident", id: "inc_test", name: "Storm damage", trades: ["plumber", "electrician", "welder"], value: 6, pm_fee: 3, deadline: 6 };

function game(pmTrade) {
  resetIds();
  const g = new Game(economy, [{ name: "PM", service: pmTrade }, { name: "P", service: "plumber" }, { name: "E", service: "electrician" }, { name: "W", service: "welder" }], { ...decks, fortune: [], jobprogress: [], seed: 1, difficulty: "standard" });
  g.start();
  for (const pl of g.state.players) pl.tradesmen.push({ id: `T_${pl.name}`, prod_mod: 0, flag: null, assignedJob: null, out_until: null, tool: null });
  return g;
}
const deliver = (g, pl) => { const j = pl.jobs.find((x) => x.incident_id); jobs.assign(g.state, pl, j.id); j.work_done = j.work_amount; jobs.runJobProgress(g.state, pl); };

// (1) a tender per trade (NPC-paid) + a mini-PM contract in flight.
{
  const g = game("mechanic"); // PM runs none of the 3 → all route to rivals
  const [pm, p, e, w] = g.state.players;
  applyIncident(g.state, pm, CARD);
  assert.equal(g.state.incidents.length, 1, "an incident contract is in flight");
  for (const [pl, trade] of [[p, "plumber"], [e, "electrician"], [w, "welder"]]) {
    assert.ok(pl.jobs.some((j) => j.incident_id && j.name.includes(trade) && j.hirer_id == null), `${trade} got an NPC-paid tender`);
  }
  ok("incident → a tender per trade, NPC-paid, tracked by the PM contract");
}

// (2) all tenders delivered → the PM takes the fee.
{
  const g = game("mechanic");
  const [pm, p, e, w] = g.state.players;
  applyIncident(g.state, pm, CARD);
  const pm0 = pm.cash;
  deliver(g, p); deliver(g, e); deliver(g, w);
  assert.equal(g.state.incidents.length, 0, "contract complete");
  assert.equal(pm.cash, pm0 + 3, "PM takes the 3W coordination fee");
  ok("all tenders land → PM fee paid");
}

// (3) a contractor stalls → the PM loses the fee and may sue them.
{
  const g = game("mechanic");
  const [pm, p, e, w] = g.state.players;
  applyIncident(g.state, pm, CARD);
  deliver(g, p); deliver(g, e); // welder stalls
  const wj = w.jobs.find((j) => j.incident_id);
  const line = onIncidentTenderBotch(g.state, w, wj);
  assert.ok(line, "the PM may sue the staller");
  const claim = g.state.pendingDamages.find((c) => c.hirerId === pm.id && c.contractorId === w.id);
  assert.ok(claim && claim.recipientId === pm.id, "PM gets a recover-to-me damages claim against the staller");
  assert.equal(g.state.incidents.length, 0, "the failed contract is cleared (PM loses the fee)");
  ok("a stalled tender → PM loses fee + sues the defaulter");
}

// (4) a trade nobody runs is handled by the county (no tender, contract can still complete).
{
  const g = game("plumber"); // only the PM(plumber) + E + W run trades; no mechanic/pipefitter needed here
  const [pm] = g.state.players;
  const card2 = { ...CARD, id: "inc2", trades: ["plumber", "pipefitter", "welder"] }; // no pipefitter at the table
  applyIncident(g.state, pm, card2);
  const c = g.state.incidents[0];
  assert.ok(c.portions.find((x) => x.trade === "pipefitter")?.bank, "the unrunnable trade is county-covered");
  ok("a trade with no local player → county-covered (no tender)");
}

console.log(`\nAll incident checks passed (${passed}).`);
