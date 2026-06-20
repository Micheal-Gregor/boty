// Stage 4 smoke test — resolvers + hand/counter. Dice are made deterministic by overriding
// state.die with a scripted sequence, so every litigation outcome is exact.
//
// Run: node test/stage4.js

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds, createPayable } from "../src/state/state.js";
import { civilTarget, demandTarget } from "../src/engine/litigation.js";
import * as payables from "../src/engine/payables.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };

const economy = await loadEconomy();
const D = economy.civil.deposit;

/** A die that returns a fixed queue of rolls; throws if an unexpected extra roll happens. */
function scriptedDie(rolls) {
  const q = [...rolls];
  return () => {
    if (q.length === 0) throw new Error("scripted die exhausted (unexpected roll)");
    return q.shift();
  };
}

function newGame(names = ["Ana"]) {
  resetIds();
  return new Game(economy, names.map((n, i) => ({ name: n, service: economy.services[i] })), { seed: 1 });
}

// --- Civil target math (Dial 5) -----------------------------------------------------------
{
  assert.equal(civilTarget(economy, {}), 2, "baseline 2+");
  assert.equal(civilTarget(economy, { slick: true }), 4, "opponent Slick Lawyer → 4+");
  assert.equal(civilTarget(economy, { late: true }), 3, "late/botched → 3+");
  assert.equal(civilTarget(economy, { late: true, slick: true }), 5, "late + Slick → 5+");
  assert.equal(civilTarget(economy, { slick: true, ownLawyer: true }), 3, "own lawyer cancels a Slick (−1)");
  assert.equal(civilTarget(economy, { court: true }), 3, "court penalty → weak case 3+");
  assert.equal(demandTarget(1), 2, "1st dodge 2+");
  assert.equal(demandTarget(4), 5, "4th dodge 5+");
  ok("civil target + demand target math matches the dials");
}

// --- AR factoring (10%) -------------------------------------------------------------------
{
  const g = newGame();
  const p = g.currentPlayer;
  p.invoices.push({ id: "I9", amount: 10, source_job: "x", due_turn: 99, factored: false });
  const before = p.cash;
  g.factorInvoice("I9");
  const fee = Math.ceil(10 * economy.factoring_fee);
  assert.equal(p.cash, before + (10 - fee), "factoring pays amount minus the fee");
  assert.equal(p.invoices.length, 0);
  ok(`AR factoring: 10 W invoice → ${10 - fee} W now (${fee} W fee)`);
}

// --- NPC Demand Roll: dodge, settle, forgive, court --------------------------------------
function npcPayable(turn = 5) {
  const g = newGame();
  g.state.turn = turn;
  const ap = createPayable({ vendor: "Vendor", amount: 6, dueTurn: turn, isNpc: true });
  g.currentPlayer.payables.push(ap);
  return { g, p: g.currentPlayer, ap };
}
{
  const { g, p, ap } = npcPayable();
  g.state.die = scriptedDie([2]); // 1st dodge target 2 → pass
  payables.processDuePayables(g.state, p);
  assert.equal(p.payables.length, 1, "passed Demand Roll → still owed, dodged again");
  assert.equal(ap.turns_dodged, 1);
  ok("Demand Roll pass → dodge again");
}
{
  const { g, p } = npcPayable();
  g.state.die = scriptedDie([6]); // 1st-dodge natural 6 → settle at 50%
  const before = p.cash;
  payables.processDuePayables(g.state, p);
  assert.equal(p.payables.length, 0, "settled away");
  assert.equal(p.cash, before - Math.ceil(6 * economy.npc_demand.settle_fraction), "paid 50% to settle");
  ok("Demand Roll natural 6 on 1st dodge → settle at 50%");
}
{
  const { g, p, ap } = npcPayable();
  ap.turns_dodged = economy.npc_demand.max_dodges - 1; // next dodge is the last
  g.state.die = scriptedDie([6]); // last-turn natural 6 → forgiven
  const before = p.cash;
  payables.processDuePayables(g.state, p);
  assert.equal(p.payables.length, 0);
  assert.equal(p.cash, before, "forgiven — paid nothing");
  ok("Demand Roll natural 6 on the final dodge → debt forgiven");
}
{
  const { g, p } = npcPayable();
  g.state.die = scriptedDie([1, 5]); // demand fail (1<2), then court win (5 ≥ 3)
  const before = p.cash;
  payables.processDuePayables(g.state, p);
  assert.equal(p.payables.length, 0, "AP wiped");
  assert.equal(p.cash, before, "won in court → walks clean, no cost (fee reimbursed)");
  ok("Demand Roll fail → court WIN walks clean");
}
{
  const { g, p } = npcPayable();
  g.state.die = scriptedDie([1, 1]); // demand fail, court lose (1 < 3)
  const before = p.cash;
  payables.processDuePayables(g.state, p);
  assert.equal(p.cash, before - (6 + economy.civil.damages_fee), "lost in court → paid amount + fee");
  ok("Demand Roll fail → court LOSE pays amount + fee");
}

// --- Player sue window: opens, ticks down, forgiven if unsued -----------------------------
{
  const g = newGame(["Ana", "Bo"]);
  const debtor = g.state.players[1];
  const ap = createPayable({ vendor: "Ana", amount: 5, dueTurn: 1, isNpc: false, creditorId: g.state.players[0].id });
  debtor.payables.push(ap);
  g.state.turn = 2; // overdue
  payables.processDuePayables(g.state, debtor);
  assert.equal(ap.sue_window_remaining, economy.sue_window, "sue window opens at full length");
  let guard = 0;
  while (debtor.payables.length && guard++ < 10) { g.state.turn++; payables.processDuePayables(g.state, debtor); }
  assert.equal(debtor.payables.length, 0, "unsued within the window → debt forgiven");
  ok("player sue window opens, ticks down, forgives if unsued");
}

// --- sue(): the player-vs-player civil resolver ------------------------------------------
function suableGame() {
  const g = newGame(["Ana", "Bo"]); // Ana (creditor) is current player
  const creditor = g.state.players[0];
  const debtor = g.state.players[1];
  const ap = createPayable({ vendor: "Ana", amount: 5, dueTurn: 1, isNpc: false, creditorId: creditor.id });
  ap.sue_window_remaining = economy.sue_window;
  debtor.payables.push(ap);
  return { g, creditor, debtor, ap };
}
{
  const { g, creditor, debtor } = suableGame();
  const c0 = creditor.cash, d0 = debtor.cash;
  g.sue(debtor.id, debtor.payables[0].id);
  g.state.die = scriptedDie([1]); // defendant target 3 (late), rolls 1 → defendant LOSES
  g.respondToThreat({ contest: true });
  // creditor: −D (deposit) +2D (pot) +5 (debt). debtor: −D −5.
  assert.equal(creditor.cash, c0 - D + 2 * D + 5);
  assert.equal(debtor.cash, d0 - D - 5);
  assert.equal(debtor.payables.length, 0, "debt collected");
  ok("sue: creditor WINS → collects debt + pot");
}
{
  const { g, creditor, debtor } = suableGame();
  const c0 = creditor.cash, d0 = debtor.cash;
  g.sue(debtor.id, debtor.payables[0].id);
  g.state.die = scriptedDie([6]); // defendant rolls 6 ≥ 3 → defendant WINS
  g.respondToThreat({ contest: true });
  assert.equal(debtor.cash, d0 - D + 2 * D, "debtor takes the pot");
  assert.equal(creditor.cash, c0 - D, "creditor loses the deposit");
  assert.equal(debtor.payables.length, 1, "debt stands; window keeps ticking");
  ok("sue: defendant WINS → takes pot, debt stands");
}
{
  const { g, creditor, debtor } = suableGame();
  const c0 = creditor.cash, d0 = debtor.cash;
  g.sue(debtor.id, debtor.payables[0].id);
  g.respondToThreat({ contest: false }); // concede — no roll
  assert.equal(creditor.cash, c0 + 5, "creditor recovers deposit and collects the debt");
  assert.equal(debtor.cash, d0 - 5);
  ok("sue: concede → debtor pays, no roll");
}

// --- Sabotage → Rush response window ------------------------------------------------------
function sabotageGame() {
  const g = newGame(["Ana", "Bo"]);
  const attacker = g.state.players[0];
  const owner = g.state.players[1];
  attacker.hand.push({ id: "sab", type: "sabotage", counterable_by: ["rush"] });
  owner.jobs.push({ id: "J9", name: "Job", work_amount: 10, work_done: 0, deadline_turn: 8, state: "Active", assigned_tradesmen: [], min_tradesmen: 1, max_tradesmen: 1, required_equipment: null, droppable: true, exposed: false });
  return { g, attacker, owner, job: owner.jobs[0] };
}
{
  const { g, owner, job } = sabotageGame();
  owner.hand.push({ id: "r", type: "rush" });
  g.playSabotage("J9");
  assert.ok(g.state.pendingThreat, "threat opened");
  g.respondToThreat({ counter: true });
  assert.equal(job.deadline_turn, 8, "Rush counters — deadline untouched");
  assert.equal(owner.hand.length, 0, "Rush consumed");
  assert.equal(g.state.pendingThreat, null);
  ok("Sabotage countered by Rush → negated");
}
{
  const { g, job } = sabotageGame();
  g.playSabotage("J9");
  g.respondToThreat({ counter: false }); // let it land
  assert.equal(job.deadline_turn, 8 - economy.cards.sabotage_delay, "Sabotage pulls the deadline in");
  ok("Sabotage lands → deadline shrinks");
}

// --- Buy Time -----------------------------------------------------------------------------
{
  const g = newGame();
  const p = g.currentPlayer;
  p.hand.push({ id: "bt", type: "buy_time" });
  p.jobs.push({ id: "J1", name: "Job", deadline_turn: 5, state: "Active", assigned_tradesmen: [], work_amount: 5, work_done: 0, min_tradesmen: 1, max_tradesmen: 1, required_equipment: null, droppable: true, exposed: false });
  g.playBuyTime("J1");
  assert.equal(p.jobs[0].deadline_turn, 5 + economy.cards.buy_time_turns, "Buy Time extends a job deadline");
  assert.equal(p.hand.length, 0, "Buy Time consumed");
  ok("Buy Time extends a deadline");
}

// --- Class Action force-settles all AP ----------------------------------------------------
{
  const g = newGame(["Ana", "Bo"]);
  g.state.players[0].payables.push(createPayable({ vendor: "V1", amount: 4, dueTurn: 9, isNpc: true }));
  g.state.players[1].payables.push(createPayable({ vendor: "V2", amount: 7, dueTurn: 9, isNpc: true }));
  const c0 = g.state.players[0].cash, c1 = g.state.players[1].cash;
  payables.classAction(g.state);
  assert.equal(g.state.players[0].cash, c0 - 4);
  assert.equal(g.state.players[1].cash, c1 - 7);
  assert.ok(g.state.players.every((p) => p.payables.length === 0), "all AP settled");
  ok("Class Action force-settles every player's AP at full value");
}

// --- Forced player-to-player jobs ---------------------------------------------------------
import { drawFortune } from "../src/engine/fortune.js";
import * as jobs from "../src/engine/jobs.js";

const forcedCard = { type: "job", id: "sub", name: "Subcontract", value: 12, work_amount: 9, deadline: 4, min_tradesmen: 1, max_tradesmen: 2, required_equipment: null, droppable: false, forced: { deposit: 4 } };

{
  // Draw: the client (richest other player) pays the deposit to the contractor.
  resetIds();
  const g = new Game(economy, [{ name: "Contractor", service: "mechanic" }, { name: "Client", service: "plumber" }], { seed: 1, fortune: [forcedCard] });
  const contractor = g.state.players[0];
  const client = g.state.players[1];
  client.cash += 5; // make Client the richer one so it's chosen
  const c0 = contractor.cash, k0 = client.cash;
  const [drawn] = drawFortune(g.state, contractor, 1);
  const job = drawn.job;
  assert.equal(job.forced_target, client.id, "client assigned to forced job");
  assert.equal(contractor.cash, c0 + 4, "contractor received the deposit");
  assert.equal(client.cash, k0 - 4, "client paid the deposit");
  ok("forced job: client pays the deposit to the contractor up front");

  // Complete it on time → contractor invoices only the rest (value − deposit).
  g.state.die = scriptedDie([]); // no rolls expected
  contractor.equipment.push({ id: "E1", defId: "pro", owned: true }); // speed 3
  jobs.assign(g.state, contractor, job.id);
  // 9 work at speed 3 → 3 turns; bump work_done to finish in one progress call.
  job.work_done = 6;
  jobs.runJobProgress(g.state, contractor);
  assert.equal(contractor.invoices.length, 1);
  assert.equal(contractor.invoices[0].amount, 12 - 4, "invoice is the rest after the deposit");
  ok("forced job completed: only the rest (value − deposit) is invoiced");
}
{
  // Abandon: contractor lets the forced job expire → client gets a suable payable.
  resetIds();
  const g = new Game(economy, [{ name: "Contractor", service: "mechanic" }, { name: "Client", service: "plumber" }], { seed: 1, fortune: [forcedCard] });
  const contractor = g.state.players[0];
  const client = g.state.players[1];
  const [drawn] = drawFortune(g.state, contractor, 1);
  const job = drawn.job;
  g.state.turn = job.deadline_turn + 1; // overdue
  jobs.expireOverdue(g.state, contractor);
  assert.equal(contractor.jobs.length, 0, "forced job expired");
  assert.equal(contractor.payables.length, 1, "abandonment created a payable");
  const ap = contractor.payables[0];
  assert.equal(ap.amount, 4, "owes the deposit");
  assert.equal(ap.creditor_id, client.id, "owed to the client");
  assert.equal(ap.is_npc, false, "it's a player payable (suable)");
  ok("forced job abandoned → client holds a suable player-payable for the deposit");
}
{
  // 1-player fallback: no client → plain NPC job, no deposit, no payable on abandon.
  resetIds();
  const g = new Game(economy, [{ name: "Solo", service: "mechanic" }], { seed: 1, fortune: [forcedCard] });
  const p = g.currentPlayer;
  const c0 = p.cash;
  const [drawn] = drawFortune(g.state, p, 1);
  assert.equal(drawn.job.forced_target, null, "no client at the table");
  assert.equal(drawn.job.deposit, 0, "no deposit");
  assert.equal(p.cash, c0, "cash unchanged");
  g.state.turn = drawn.job.deadline_turn + 1;
  jobs.expireOverdue(g.state, p);
  assert.equal(p.payables.length, 0, "NPC fallback: no suable payable on abandon");
  ok("forced job with no client falls back to a plain NPC job");
}

// --- The Final Reckoning -----------------------------------------------------------------
{
  // Drive a 2-player game to year-end and confirm the reckoning opens in standings order.
  resetIds();
  const econ = { ...economy, max_turns: 2 };
  const g = new Game(econ, [{ name: "Rich", service: "welder" }, { name: "Poor", service: "plumber" }], { seed: 1 });
  g.state.players[0].cash = 100;
  g.state.players[1].cash = 10;
  let ctx = g.start();
  let safety = 0;
  while (!ctx.over && !ctx.reckoning && safety++ < 50) ctx = g.endTurn();
  assert.ok(ctx.reckoning, "year-end opens the Final Reckoning (survivors present)");
  assert.deepEqual(ctx.order.map((id) => g.state.players.find((p) => p.id === id).name), ["Poor", "Rich"], "Last Licks run trailing-player-first");
  ok("Final Reckoning opens in standings order (trailing first)");
}
{
  // closeBooks collects ALL receivables in full; leaves AP untouched; crowns the most cash.
  resetIds();
  const econ = { ...economy, max_turns: 2 };
  const g = new Game(econ, [{ name: "Ana", service: "mechanic" }, { name: "Bo", service: "plumber" }], { seed: 1 });
  let ctx = g.start();
  let safety = 0;
  while (!ctx.over && !ctx.reckoning && safety++ < 50) ctx = g.endTurn();
  const ana = g.state.players[0];
  ana.invoices.push({ id: "I1", amount: 9, source_job: "x", due_turn: 999, factored: false });
  ana.payables.push(createPayable({ vendor: "Vendor", amount: 7, dueTurn: 999, isNpc: true }));
  const cashBefore = ana.cash;
  const apBefore = ana.payables.length;
  const final = g.closeBooks();
  assert.equal(ana.cash, cashBefore + 9, "all receivables collect in full at year-end (NPC always pays)");
  assert.equal(ana.invoices.length, 0, "AR cleared");
  assert.equal(ana.payables.length, apBefore, "AP is NOT force-settled — stiffing vendors is a strategy");
  assert.ok(final.over && final.results, "books close and standings are produced");
  ok("closeBooks: AR collects in full, AP untouched, winner is the most cash");
}
{
  // Reckoning sabotage buries a forced job → the client gets a suable deposit debt.
  resetIds();
  const econ = { ...economy, max_turns: 1 };
  const g = new Game(econ, [{ name: "Client", service: "welder" }, { name: "Rival", service: "plumber" }], { seed: 1 });
  const client = g.state.players[0];
  const rival = g.state.players[1];
  client.hand.push({ id: "sab", type: "sabotage", counterable_by: ["rush"] });
  // Rival is mid-way through a forced job commissioned by Client.
  rival.jobs.push({ id: "JF", name: "Subcontract", work_amount: 10, work_done: 4, deadline_turn: 9, state: "Active", assigned_tradesmen: [], min_tradesmen: 1, max_tradesmen: 2, required_equipment: null, required_building_tier: 1, equipment_per_tradesman: false, droppable: false, forced_target: client.id, deposit: 4, exposed: false });
  let ctx = g.start();
  let safety = 0;
  while (!ctx.over && !ctx.reckoning && safety++ < 50) ctx = g.endTurn();
  assert.ok(ctx.reckoning, "reached the reckoning");
  g.seatReckoning(client.id);
  g.playSabotage("JF");
  g.respondToThreat({ counter: false }); // Rival has no Rush
  assert.ok(!rival.jobs.some((j) => j.id === "JF"), "the forced job is buried");
  const debt = rival.payables.find((a) => a.creditor_id === client.id);
  assert.ok(debt && debt.amount === 4, "Rival now owes Client the 4 W deposit — suable");
  ok("Reckoning Sabotage buries a rival's forced job → suable deposit debt");
}
{
  // A reckoning action that isn't a final play (e.g. hire) is refused.
  resetIds();
  const econ = { ...economy, max_turns: 1 };
  const g = new Game(econ, [{ name: "Ana", service: "mechanic" }, { name: "Bo", service: "plumber" }], { seed: 1 });
  let ctx = g.start();
  let safety = 0;
  while (!ctx.over && !ctx.reckoning && safety++ < 50) ctx = g.endTurn();
  g.seatReckoning(g.state.players[0].id);
  assert.throws(() => g.hire(), /year is over/i);
  ok("Reckoning refuses non-final actions (no hiring once the year is up)");
}

console.log(`\nAll Stage 4 smoke checks passed (${passed}).`);
