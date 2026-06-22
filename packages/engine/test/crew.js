// Crew-life test (card batch 2) — sideline (holiday/sick/injury) and Poached.

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds, createTradesman } from "../src/state/state.js";
import { applyCrewEvent, returnCrew } from "../src/engine/crew.js";
import { isSidelined } from "../src/engine/jobs.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };
const economy = await loadEconomy();

// Holiday sidelines a worker: off any job, can't be assigned, returns when their time is up.
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0];
  const t = ana.tradesmen[0];
  applyCrewEvent(g.state, ana, { effect: "sideline", duration: 2, name: "Took his holiday" });
  assert.ok(isSidelined(t, g.state.turn), "worker is sidelined");

  ana.jobs.push({ id: "J1", name: "Brake job", value: 8, work_amount: 4, work_done: 0, deadline_turn: g.state.turn + 3, min_tradesmen: 1, max_tradesmen: 1, required_equipment: null, terms: 1, required_building_tier: 1, equipment_per_tradesman: false, droppable: true, required_trade: null, hirer_id: null, state: "Queued", assigned_tradesmen: [] });
  assert.throws(() => g.assignJob("J1", t.id), /out until/, "a sidelined worker can't be assigned");

  g.state.turn += 2;
  returnCrew(g.state, ana);
  assert.ok(!isSidelined(t, g.state.turn), "worker returns once their time is up");
  ok("holiday: sidelined, unassignable, then back");
}

// Injury sidelines AND books a workers' comp claim.
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0];
  const cashBefore = ana.cash;
  applyCrewEvent(g.state, ana, { effect: "injury", duration: 2, claim: 4, name: "On-the-job injury" });
  assert.equal(ana.cash, cashBefore - 4, "workers' comp claim paid");
  assert.ok(isSidelined(ana.tradesmen[0], g.state.turn), "injured worker sidelined");
  ok("injury: sidelined + a workers' comp claim");
}

// Poached: pay the raise to keep them, or lose them if you can't.
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0];
  ana.tradesmen.push(createTradesman()); // a second hand to lose
  const n = ana.tradesmen.length;
  applyCrewEvent(g.state, ana, { effect: "poached", raise: 3, name: "Poached!" });
  assert.equal(ana.tradesmen.length, n, "kept the worker by matching the offer");
  ana.cash = 0;
  applyCrewEvent(g.state, ana, { effect: "poached", raise: 3, name: "Poached!" });
  assert.equal(ana.tradesmen.length, n - 1, "lost a worker when the offer couldn't be matched");
  ok("poached: pay to retain, or lose them");
}

console.log(`\nAll crew checks passed (${passed}).`);
