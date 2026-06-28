// Contract routing choice: a human GC/PM decides who runs each trade (local subs or the bank/county);
// an AI decides inline (deny a richer rival, share with a poorer one) — deterministic, no pending state.
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { startRouted } from "../src/engine/routed.js";
import { applyIncident } from "../src/engine/incidents.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();
let n = 0; const ok = (m) => { n++; console.log(`  ✓ ${m}`); };

const seats = [{ name: "GC", service: "plumber" }, { name: "Rich", service: "electrician" }, { name: "Poor", service: "HVAC technician" }];
const rtCard = { id: "rt_test", type: "routed", name: "Test GC", required_trades: ["plumber", "electrician", "HVAC technician"], sub_value: 6, markup: 2, deadline: 5 };
const staff = (g) => { for (const p of g.state.players.slice(1)) p.tradesmen.push({ id: `T${p.id}`, prod_mod: 0, flag: null, assignedJob: null, out_until: null }); };

// (1) AI actor resolves inline: denies a richer rival (→ bank), shares with a poorer one.
{
  resetIds();
  const g = new Game(economy, seats, { ...decks, fortune: [], seed: 1 });
  g.start();
  const [gc, rich, poor] = g.state.players;
  gc.cash = 20; rich.cash = 50; poor.cash = 5; staff(g);
  startRouted(g.state, gc, rtCard);
  assert.equal(g.state.pendingRouting.length, 0, "AI decides inline — nothing pending");
  assert.ok(!rich.jobs.some((j) => j.routed_id), "denied the richer rival (electrician → bank)");
  assert.ok(poor.jobs.some((j) => j.routed_id), "routed to the poorer rival (HVAC → Poor)");
  ok("AI routes inline: denies a richer rival, shares with a poorer one");
}

// (2) Human GC defers, then declines one sub to the bank and keeps the other.
{
  resetIds();
  const g = new Game(economy, seats, { ...decks, fortune: [], seed: 1 });
  g.start();
  const [gc, rich, poor] = g.state.players;
  g.state.humanIds = [gc.id]; staff(g);
  startRouted(g.state, gc, rtCard);
  assert.equal(g.state.pendingRouting.length, 1, "human GC defers — routing pending");
  const choosable = g.state.pendingRouting[0].portions.filter((p) => p.choosable).map((p) => p.trade).sort();
  assert.deepEqual(choosable, ["HVAC technician", "electrician"], "both rival trades are choosable; your own isn't");
  g.decideRouting({ electrician: "bank" });
  assert.equal(g.state.pendingRouting.length, 0, "resolved");
  assert.ok(!rich.jobs.some((j) => j.routed_id), "declined electrician → bank (Rich gets nothing)");
  assert.ok(poor.jobs.some((j) => j.routed_id), "kept HVAC with Poor");
  assert.ok(gc.jobs.some((j) => j.routed_id && j.card?.endsWith("_self")), "GC still runs their own plumber portion");
  ok("human GC: defers, declines one sub to the bank, keeps the other");
}

// (3) Incident: human PM defers, declines a tender to the county.
{
  resetIds();
  const g = new Game(economy, seats, { ...decks, fortune: [], seed: 1 });
  g.start();
  const [pm, r, h] = g.state.players;
  g.state.humanIds = [pm.id]; staff(g);
  applyIncident(g.state, pm, { id: "inc_test", type: "incident", name: "Test Incident", trades: ["plumber", "electrician", "HVAC technician"], value: 6, pm_fee: 3, deadline: 4 });
  assert.equal(g.state.pendingRouting.length, 1, "human PM defers the incident routing");
  g.decideRouting({ electrician: "bank" });
  assert.ok(!r.jobs.some((j) => j.incident_id), "declined electrician tender → county");
  assert.ok(h.jobs.some((j) => j.incident_id), "kept HVAC tender with H");
  assert.ok(pm.jobs.some((j) => j.incident_id), "PM runs their own plumber tender");
  ok("human PM: defers incident, declines a tender to the county");
}

console.log(`All routing checks passed (${n}).`);
