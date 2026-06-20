// Stage 2 smoke test — the job queue + the late rule (the heart). Drives the engine directly
// (no deck randomness) by injecting a single known job card so outcomes are deterministic.
//
// Run: node test/stage2.js

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import * as jobs from "../src/engine/jobs.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };
const expectRefusal = (fn, label) => {
  assert.throws(fn, /GameError|requires|max|sticky|one job|Active|No /i);
  ok(`refused: ${label}`);
};

const economy = await loadEconomy();

// A deck of one tiny job, so draw() always yields the same known card.
const tinyJob = { id: "tiny", name: "Tiny job", value: 6, work_amount: 4, deadline: 3, min_tradesmen: 1, max_tradesmen: 2, required_equipment: null, droppable: true };
const gatedJob = { id: "gated", name: "Gated job", value: 9, work_amount: 6, deadline: 4, min_tradesmen: 1, max_tradesmen: 1, required_equipment: "pro", droppable: true };
const stickyJob = { id: "sticky", name: "Sticky job", value: 16, work_amount: 99, deadline: 2, min_tradesmen: 1, max_tradesmen: 3, required_equipment: null, droppable: false };

function newGame(cards, seed = 1) {
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { jobCards: cards, seed });
  return g;
}

// --- Draw power = capped headcount -------------------------------------------------------
{
  const g = newGame([tinyJob]);
  const ctx = g.start();
  assert.equal(ctx.drawn.length, 1); // one tradesperson → draw 1
  assert.equal(g.currentPlayer.jobs.length, 1);
  assert.equal(g.currentPlayer.jobs[0].state, "Queued");
  ok("draw power equals tradesperson count; drawn job lands Queued");
}

// --- Assign → Active → burn → complete → invoice → collect -------------------------------
{
  const g = newGame([tinyJob]);
  g.start();
  const p = g.currentPlayer;
  const job = p.jobs[0];

  g.assignJob(job.id); // assigns the free tradesperson
  assert.equal(job.state, "Active");
  assert.equal(p.tradesmen[0].assignedJob, job.id);
  ok("assigning a tradesperson activates the job (one job at a time)");

  // No equipment → burns at base_hand_speed (1). work_amount 4 → completes in 4 turns.
  g.runProgress();
  assert.equal(job.work_done, economy.base_hand_speed);
  ok(`Active job burns base_hand_speed (${economy.base_hand_speed}/turn) with no equipment`);

  // Buy basic tools (speed 2): now burns faster.
  g.buyEquipment("basic");
  g.runProgress();
  assert.equal(job.work_done, economy.base_hand_speed + 2);
  ok("equipment raises burn speed (best-first allocation)");

  // Finish it. work_done is 3/4; one more burn of 2 completes it.
  g.runProgress();
  assert.equal(p.jobs.length, 0, "completed job leaves the queue");
  assert.equal(p.invoices.length, 1);
  assert.equal(p.invoices[0].amount, tinyJob.value);
  assert.equal(p.tradesmen[0].assignedJob, null, "completing frees the tradesperson");
  ok("completing on time creates an invoice and frees the crew");

  // Invoice collects at upkeep once due_turn arrives (invoice_terms turns later). Isolate the
  // collection from overhead noise by driving collectInvoices at the due turn directly.
  const inv = p.invoices[0];
  assert.equal(inv.due_turn, 1 + economy.invoice_terms, "invoice due invoice_terms turns after completion");
  g.state.turn = inv.due_turn - 1;
  assert.equal(jobs.collectInvoices(g.state, p).length, 0, "not collected before due turn");
  g.state.turn = inv.due_turn;
  const cashBefore = p.cash;
  jobs.collectInvoices(g.state, p);
  assert.equal(p.cash, cashBefore + tinyJob.value, "invoice paid out in full at due turn");
  assert.equal(p.invoices.length, 0, "collected invoice leaves AR");
  ok(`invoice collected as cash ${economy.invoice_terms} turns later`);
}

// --- Equipment gates a job ---------------------------------------------------------------
{
  const g = newGame([gatedJob]);
  g.start();
  const job = g.currentPlayer.jobs[0];
  expectRefusal(() => g.assignJob(job.id), "assign to a gated job without the required equipment");
  g.rentEquipment("pro");
  g.assignJob(job.id);
  assert.equal(job.state, "Active");
  ok("required equipment gates the job until owned/rented");
}

// --- max_tradesmen and one-job-at-a-time -------------------------------------------------
{
  const g = newGame([tinyJob]);
  g.start();
  const p = g.currentPlayer;
  g.hire(); // now 2 tradespeople (garage cap 2)
  const job = p.jobs[0];
  g.assignJob(job.id, p.tradesmen[0].id);
  g.assignJob(job.id, p.tradesmen[1].id);
  assert.equal(job.assigned_tradesmen.length, 2);
  expectRefusal(() => g.assignJob(job.id, p.tradesmen[0].id), "assign a third (over max_tradesmen)");
  ok("respects max_tradesmen");
}

// --- Hold frees the crew; clock keeps ticking --------------------------------------------
{
  const g = newGame([tinyJob]);
  g.start();
  const p = g.currentPlayer;
  const job = p.jobs[0];
  g.assignJob(job.id);
  g.holdJob(job.id);
  assert.equal(job.state, "OnHold");
  assert.equal(p.tradesmen[0].assignedJob, null, "hold frees the tradesperson");
  expectRefusal(() => g.holdJob(job.id), "hold a job that isn't Active");
  ok("hold frees the crew and sets OnHold");
}

// --- Queue-expiry = no penalty; the clock always ticks -----------------------------------
{
  const g = newGame([tinyJob]);
  g.start(); // turn 1, job deadline_turn = 1 + 3 = 4
  const p = g.currentPlayer;
  const jobId = p.jobs[0].id;
  const cashStart = p.cash;
  // Never assign it; just let turns pass until past the deadline. (The deck keeps dealing new
  // cards each turn — we track the original job specifically.)
  while (g.state.turn <= tinyJob.deadline + 1 && !g.isOver) g.endTurn();
  assert.ok(!p.jobs.some((j) => j.id === jobId), "expired-in-queue job left the queue");
  assert.equal(p.invoices.length, 0, "no invoice — you just didn't get paid");
  assert.ok(p.cash < cashStart, "only cost was overhead — no expiry penalty");
  ok("queue-expiry: no penalty, just no pay");
}

// --- The late rule: a started job past deadline expires 'exposed', pays nothing ----------
{
  const g = newGame([stickyJob]); // 99 work, deadline 2 — impossible to finish in time
  g.start(); // turn 1, deadline_turn = 3
  const p = g.currentPlayer;
  const job = p.jobs[0];
  g.assignJob(job.id);
  assert.equal(job.state, "Active");
  expectRefusal(() => g.dropJob(job.id), "drop a sticky (non-droppable) job");

  // Burn some work, then run out the clock.
  g.endTurn(); // turn 1 progress, advance to turn 2
  g.endTurn(); // turn 2 progress, advance to turn 3
  g.endTurn(); // turn 3 -> upkeep at turn 4 expires it
  const expired = !p.jobs.some((j) => j.id === job.id);
  assert.ok(expired, "overdue started job was expired at upkeep");
  assert.equal(p.invoices.length, 0, "a late job pays nothing");
  assert.equal(p.tradesmen[0].assignedJob, null, "expiry frees the crew");
  ok("late rule: started job blows its deadline → expired, exposed, no pay");
}

// --- Building-tier gate: a big job needs a bigger shop to start ---------------------------
{
  const towerJob = { id: "tier2", name: "Big job", value: 18, work_amount: 6, deadline: 6, min_tradesmen: 1, max_tradesmen: 2, required_equipment: null, required_building_tier: 2, droppable: true };
  const g = newGame([towerJob]);
  g.start();
  const p = g.currentPlayer;
  const job = p.jobs[0];
  expectRefusal(() => g.assignJob(job.id), "assign a tier-2 job from the garage");
  p.building = "shop"; // tier 2
  g.assignJob(job.id);
  assert.equal(job.state, "Active", "activates once in a tier-2 shop");
  ok("building-tier gate: a big job requires a bigger shop to start");
}

// --- Equipment-per-tradesman gate: gear the whole crew ------------------------------------
{
  const crewJob = { id: "crew", name: "Geared job", value: 20, work_amount: 30, deadline: 8, min_tradesmen: 1, max_tradesmen: 2, required_equipment: null, equipment_per_tradesman: true, droppable: true };
  const g = newGame([crewJob]);
  g.start();
  const p = g.currentPlayer;
  g.hire(); // 2 tradespeople (garage cap 2)
  const job = p.jobs[0];
  g.buyEquipment("basic"); // 1 tool
  g.assignJob(job.id, p.tradesmen[0].id);
  assert.equal(job.state, "Active", "one worker + one tool → Active");
  g.assignJob(job.id, p.tradesmen[1].id);
  assert.equal(job.state, "OnHold", "second worker with no second tool → auto-held");
  g.buyEquipment("basic"); // 2 tools now
  g.runProgress(); // re-evaluates: tools per worker satisfied → Active and burns
  assert.equal(job.state, "Active", "buying the second tool re-activates the held job");
  ok("equipment-per-tradesman gate: the whole crew must be geared");
}

console.log(`\nAll Stage 2 smoke checks passed (${passed}).`);
