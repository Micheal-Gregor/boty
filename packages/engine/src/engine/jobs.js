// The job state machine — the heart of Stage 2.
//
//   Queued → Active → OnHold → (Active again | Expired | Complete)
//
// Rules enforced here (per the design doc):
//   • A tradesperson runs ONE job at a time (your parallelism is your headcount).
//   • The deadline clock always ticks — in every state — and is checked at upkeep.
//   • Queue-expiry = no penalty (you just don't get paid). A STARTED job that expires late is
//     flagged `exposed` (inert in Stage 2; bites in later stages).
//   • Completing on time creates an invoice. A late job pays nothing — enforced because a job
//     past its deadline is expired at the next upkeep before it can complete.
//   • Equipment gates jobs (required_equipment) and sets burn speed; more workers finish big
//     jobs faster.

import { GameError, findEquipment, findBuilding, w } from "./economy.js";
import { createInvoice } from "../state/state.js";

const PROGRESSING = new Set(["Queued", "Active", "OnHold"]);

function findJob(player, jobId) {
  const job = player.jobs.find((j) => j.id === jobId);
  if (!job) throw new GameError(`No job "${jobId}" in ${player.name}'s queue`);
  return job;
}

function hasEquipment(player, defId) {
  return defId == null || player.equipment.some((e) => e.defId === defId);
}

function buildingTier(state, player) {
  return findBuilding(state.economy, player.building).tier ?? 1;
}

/** Hard start-gates (checked when assigning): the equipment TYPE and the building TIER. */
function meetsHardGates(state, player, job) {
  if (!hasEquipment(player, job.required_equipment)) {
    const def = findEquipment(state.economy, job.required_equipment);
    return { ok: false, reason: `requires ${def?.name ?? job.required_equipment} — buy or rent it first` };
  }
  if (buildingTier(state, player) < job.required_building_tier) {
    return { ok: false, reason: `requires a tier-${job.required_building_tier} shop — relocate to a bigger building first` };
  }
  return { ok: true };
}

/** A tool for every assigned tradesperson, when the job demands a fully geared crew. */
function hasToolPerWorker(player, job) {
  return !job.equipment_per_tradesman || player.equipment.length >= job.assigned_tradesmen.length;
}

/** Recompute a job's state from its assignment after any change. */
function refreshState(state, player, job) {
  if (job.state === "Expired" || job.state === "Complete") return;
  const ready =
    job.assigned_tradesmen.length >= job.min_tradesmen &&
    meetsHardGates(state, player, job).ok &&
    hasToolPerWorker(player, job);
  job.state = ready ? "Active" : job.assigned_tradesmen.length > 0 ? "OnHold" : "Queued";
}

/**
 * Pull a specific tradesperson off whatever job they're on and recompute that job's state
 * (it may drop to OnHold below min staff). Used when an event removes a worker (e.g. a
 * retirement) so the disruption ripples into the job correctly.
 */
export function releaseTradesman(state, player, tradesmanId) {
  const t = player.tradesmen.find((x) => x.id === tradesmanId);
  if (!t || t.assignedJob == null) return;
  const job = player.jobs.find((j) => j.id === t.assignedJob);
  t.assignedJob = null;
  if (job) {
    job.assigned_tradesmen = job.assigned_tradesmen.filter((id) => id !== tradesmanId);
    refreshState(state, player, job);
  }
}

// --- Player actions ---------------------------------------------------------------------

/** Assign a free tradesperson to a job. Activates the job once min staff + gear are present. */
export function assign(state, player, jobId, tradesmanId) {
  const job = findJob(player, jobId);
  if (!PROGRESSING.has(job.state)) throw new GameError(`${job.name} is ${job.state} — can't assign`);
  if (job.assigned_tradesmen.length >= job.max_tradesmen) {
    throw new GameError(`${job.name} is already at its max of ${job.max_tradesmen} tradespeople`);
  }
  const gate = meetsHardGates(state, player, job);
  if (!gate.ok) throw new GameError(`${job.name} ${gate.reason}`);
  const t = tradesmanId
    ? player.tradesmen.find((x) => x.id === tradesmanId)
    : player.tradesmen.find((x) => x.assignedJob == null);
  if (!t) throw new GameError(tradesmanId ? `No tradesperson "${tradesmanId}"` : `No free tradesperson to assign`);
  if (t.assignedJob != null) throw new GameError(`${t.id} is already on ${t.assignedJob} (one job at a time)`);

  t.assignedJob = job.id;
  job.assigned_tradesmen.push(t.id);
  refreshState(state, player, job);
  return `${player.name} assigned ${t.id} to ${job.name} (${job.id}) — now ${job.state}`;
}

/** Put an Active job On-Hold, freeing its tradespeople (e.g. to redeploy them). */
export function hold(state, player, jobId) {
  const job = findJob(player, jobId);
  if (job.state !== "Active") throw new GameError(`${job.name} is ${job.state} — only Active jobs can be held`);
  freeTradesmen(player, job);
  job.state = "OnHold";
  return `${player.name} put ${job.name} (${job.id}) on hold — its clock keeps ticking`;
}

/** Drop a job entirely. Only droppable jobs can be walked away from for free. */
export function drop(state, player, jobId) {
  const job = findJob(player, jobId);
  if (!job.droppable) throw new GameError(`${job.name} is a sticky job — you can't just walk away`);
  freeTradesmen(player, job);
  player.jobs = player.jobs.filter((j) => j.id !== jobId);
  return `${player.name} dropped ${job.name} (${job.id})`;
}

function freeTradesmen(player, job) {
  for (const tid of job.assigned_tradesmen) {
    const t = player.tradesmen.find((x) => x.id === tid);
    if (t) t.assignedJob = null;
  }
  job.assigned_tradesmen = [];
}

/**
 * A routed job the contractor failed to deliver. The hirer's liability is cleared (no delivery,
 * no debt), and the hirer gets the right to sue the contractor for damages (the job's value,
 * paid to the bank) within the sue window. Returns a log line, or null for a non-routed job.
 */
function botchRoutedJob(state, contractor, job) {
  if (!job.hirer_id) return null;
  const hirer = state.players.find((p) => p.id === job.hirer_id);
  if (!hirer) return null;
  hirer.payables = hirer.payables.filter((a) => a.job_id !== job.id); // liability cleared
  state.pendingDamages.push({
    hirerId: hirer.id, contractorId: contractor.id, jobId: job.id, jobName: job.name,
    value: job.value, window: state.economy.sue_window,
  });
  return `↳ ${contractor.name} botched ${hirer.name}'s ${job.name} — ${hirer.name}'s ${w(job.value)} liability cleared; they may sue for damages`;
}

// --- Upkeep: clocks + expiry ------------------------------------------------------------

/**
 * Expire any of the player's not-complete jobs whose deadline has passed. Queue-expiry is
 * silent (no penalty); a started job expiring late is flagged exposed. Returns log lines.
 */
export function expireOverdue(state, player) {
  const lines = [];
  for (const job of player.jobs) {
    if (job.state === "Expired" || job.state === "Complete") continue;
    if (state.turn > job.deadline_turn) {
      const started = job.assigned_tradesmen.length > 0 || job.work_done > 0;
      freeTradesmen(player, job);
      job.state = "Expired";
      job.exposed = started;
      lines.push(
        started
          ? `⚠ ${player.name}'s ${job.name} (${job.id}) blew its deadline while in progress — expired, exposed, no pay`
          : `${player.name}'s ${job.name} (${job.id}) expired in queue — no penalty, just no pay`,
      );
      const owed = botchRoutedJob(state, player, job);
      if (owed) lines.push(owed);
    }
  }
  // Expired jobs leave the queue once reported.
  player.jobs = player.jobs.filter((j) => j.state !== "Expired");
  return lines;
}

// --- Job progress: burn work, complete on time ------------------------------------------

/**
 * Phase 4 — burn work on every Active job and complete those that finish (on time by
 * construction; overdue jobs were expired at upkeep). Equipment is a shared pool of speed:
 * its units are allocated best-first across all assigned tradespeople (queue order); a
 * tradesperson without a tool works at base_hand_speed. Returns log lines.
 */
export function runJobProgress(state, player) {
  const lines = [];
  // Re-evaluate states first: a job auto-held for missing tools/shop earlier this turn (its
  // crew is still assigned) promotes to Active now that you've geared up or relocated.
  for (const job of player.jobs) refreshState(state, player, job);
  const active = player.jobs.filter((j) => j.state === "Active");
  if (active.length === 0) return lines;

  // Build the worker slots (one per assigned tradesperson) and the equipment speed pool.
  const slots = [];
  for (const job of active) for (const _ of job.assigned_tradesmen) slots.push(job);
  const speeds = player.equipment
    .map((e) => findEquipment(state.economy, e.defId).speed)
    .sort((a, b) => b - a);

  const burnByJob = new Map();
  slots.forEach((job, i) => {
    const speed = i < speeds.length ? speeds[i] : state.economy.base_hand_speed;
    burnByJob.set(job, (burnByJob.get(job) ?? 0) + speed);
  });

  const hasProgressDeck = state.progressDeck && state.progressDeck.source.length > 0;

  for (const job of active) {
    const burn = burnByJob.get(job) ?? 0;
    job.work_done += burn;
    let note = `burned ${burn}`;

    // Draw a job-progress card against the job (Stage 3). With no progress deck (Stage 1/2
    // callers), burn stays deterministic.
    if (hasProgressDeck) {
      const card = state.progressDeck.draw();
      const outcome = applyProgressCard(state, player, job, card);
      note += `, ${card.name}${outcome ? ` (${outcome})` : ""}${card.flavor ? ` — “${card.flavor}”` : ""}`;
      if (job.state === "Expired") {
        lines.push(`✗ ${player.name}'s ${job.name} (${job.id}) — ${note}: failed, no pay`);
        const owed = botchRoutedJob(state, player, job);
        if (owed) lines.push(owed);
        continue;
      }
    }

    if (job.work_done >= job.work_amount) {
      const note2 = completionNote(state, job);
      completeJob(state, player, job);
      lines.push(`✔ ${player.name} completed ${job.name} (${job.id}) — ${note2} [${note}]`);
    } else {
      lines.push(`… ${player.name}: ${job.name} (${job.id}) ${job.work_done}/${job.work_amount}, due turn ${job.deadline_turn} [${note}]`);
    }
  }
  return lines;
}

/**
 * Apply a drawn job-progress card's effect to a job. Returns a short description of what the
 * card did (or "" for a no-op neutral card). Decisive failure expires the job in place.
 */
function applyProgressCard(state, player, job, card) {
  const e = card.effect ?? {};
  if (e.decisive === "failure") {
    freeTradesmen(player, job);
    job.state = "Expired";
    job.exposed = true;
    player.jobs = player.jobs.filter((j) => j.id !== job.id);
    return "decisive failure";
  }
  if (e.decisive === "success") {
    job.work_done = job.work_amount;
    return "decisive success";
  }
  const parts = [];
  if (e.work) { job.work_done = Math.max(0, job.work_done + e.work); parts.push(`work ${e.work > 0 ? "+" : ""}${e.work}`); }
  if (e.pay) { job.value = Math.max(0, job.value + e.pay); parts.push(`pay ${e.pay > 0 ? "+" : ""}${e.pay}W`); }
  if (e.cost) { player.cash -= e.cost; parts.push(`cost ${e.cost}W`); }
  if (e.deadline) { job.deadline_turn += e.deadline; parts.push(`deadline ${e.deadline > 0 ? "+" : ""}${e.deadline}`); }
  return parts.join(", ");
}

function completeJob(state, player, job) {
  job.state = "Complete";
  freeTradesmen(player, job);
  player.jobs = player.jobs.filter((j) => j.id !== job.id);
  if (job.hirer_id) {
    // Routed job delivered: the hirer's pending AP now comes DUE — they pay the contractor
    // (this player) or refuse and face a suit. No NPC invoice; the contractor's pay is the AP.
    const hirer = state.players.find((p) => p.id === job.hirer_id);
    const ap = hirer?.payables.find((a) => a.job_id === job.id);
    if (ap) { ap.pending = false; ap.due_turn = state.turn + state.economy.invoice_terms; }
  } else {
    player.invoices.push(createInvoice(job, state.turn, state.economy.invoice_terms));
  }
}

/** Did a routed job just complete? (For the contractor's completion log line.) */
function completionNote(state, job) {
  if (job.hirer_id) {
    const hirer = state.players.find((p) => p.id === job.hirer_id);
    return `delivered for ${hirer?.name ?? "the hirer"} — they owe ${w(job.value)} (collects when they pay)`;
  }
  return `invoice for ${w(job.value)} (collects in ${state.economy.invoice_terms} turns)`;
}

/** Complete a job immediately (used by a Reckoning Rush that finishes the work). */
export function completeNow(state, player, job) {
  completeJob(state, player, job);
}

/**
 * Abandon a job outright (used by a Reckoning Sabotage — there's no work phase left to lose it
 * the normal way). Frees the crew; a routed job clears the hirer's liability + opens a damages
 * claim.
 */
export function abandonJob(state, player, job) {
  freeTradesmen(player, job);
  job.state = "Expired";
  job.exposed = true;
  player.jobs = player.jobs.filter((j) => j.id !== job.id);
  return botchRoutedJob(state, player, job);
}

// --- Upkeep: invoice collection ---------------------------------------------------------

/** Collect (pay to cash) every invoice that has reached its due turn. Returns log lines. */
export function collectInvoices(state, player) {
  const lines = [];
  const due = player.invoices.filter((inv) => state.turn >= inv.due_turn);
  for (const inv of due) {
    player.cash += inv.amount;
    lines.push(`💵 ${player.name} collected invoice ${inv.id} for ${w(inv.amount)}`);
  }
  player.invoices = player.invoices.filter((inv) => state.turn < inv.due_turn);
  return lines;
}
