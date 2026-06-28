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
import { defectPenalty } from "./defects.js";
import { trainingSpeedBonus } from "./modifiers.js";
import { applyGlobal } from "./globals.js";
import { onPhaseComplete, onPhaseFailed } from "./projects.js";
import { accrue, cashIn, cashOut, ACCT } from "../state/ledger.js";
import { injectById, womFires } from "./livingdeck.js";
import { onCivicContractComplete } from "./civics.js";
import { onRoutedPortionComplete, onRoutedPortionBotch } from "./routed.js";
import { onReadyingBotch } from "./expansion.js";
import { onIncidentTenderComplete, onIncidentTenderBotch } from "./incidents.js";

const PROGRESSING = new Set(["Queued", "Active", "OnHold"]);

/** A tradesperson sidelined (holiday / sick / injured) and unavailable until `out_until`. */
export function isSidelined(t, turn) {
  return t.out_until != null && t.out_until > turn;
}

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

/** A tool for every assigned tradesperson, when the job demands a fully geared crew (model A: each
 *  assigned worker must have a tool ASSIGNED to them). */
function hasToolPerWorker(player, job) {
  return !job.equipment_per_tradesman || job.assigned_tradesmen.every((tid) => player.equipment.some((e) => e.assigned_to === tid));
}

/** Hand any IDLE owned/rented tool to a working tool-less worker — best (fastest) first. Never moves
 *  a tool already assigned to someone, so deliberate allocation still holds; this just stops your gear
 *  sitting in the cupboard while a worker swings bare-handed. Owned tools are free and rented tools
 *  cost their rent whether used or not, so using an idle one is always strictly better. */
function autoEquip(state, player, tradesmanId) {
  if (player.equipment.some((e) => e.assigned_to === tradesmanId)) return; // already geared
  const idle = player.equipment
    .filter((e) => e.assigned_to == null)
    .sort((a, b) => findEquipment(state.economy, b.defId).speed - findEquipment(state.economy, a.defId).speed)[0];
  if (idle) idle.assigned_to = tradesmanId;
}

/** One worker's work rate = their tool's speed (else base_hand_speed) ± their performance-review
 *  modifier (model A). Floored at 0 — a poor bare-handed worker just spins their wheels. */
export function workerProductivity(economy, player, tradesmanId) {
  const tool = player.equipment.find((e) => e.assigned_to === tradesmanId);
  const t = player.tradesmen.find((x) => x.id === tradesmanId);
  const base = tool ? findEquipment(economy, tool.defId).speed : economy.base_hand_speed;
  return Math.max(0, base + (t?.prod_mod ?? 0));
}

/** A job's headline work score = the summed productivity of the crew assigned to it. */
export function jobWorkScore(economy, player, job) {
  return job.assigned_tradesmen.reduce((s, tid) => s + workerProductivity(economy, player, tid), 0);
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
    : player.tradesmen.find((x) => x.assignedJob == null && !isSidelined(x, state.turn));
  if (!t) throw new GameError(tradesmanId ? `No tradesperson "${tradesmanId}"` : `No free tradesperson to assign`);
  if (t.assignedJob != null) throw new GameError(`${t.id} is already on ${t.assignedJob} (one job at a time)`);
  if (isSidelined(t, state.turn)) throw new GameError(`${t.id} is out until turn ${t.out_until}`);

  t.assignedJob = job.id;
  job.assigned_tradesmen.push(t.id);
  autoEquip(state, player, t.id); // hand them an idle tool so owned gear actually gets used
  refreshState(state, player, job);
  return `${player.name} assigned ${t.id} to ${job.name} (${job.id}) — now ${job.state}`;
}

/** Free a job's tradespeople so they can be redeployed — works on an Active job (pause it) OR an
 *  auto-held one (it parked itself for a missing shop tier / tool, but kept its crew assigned; this
 *  releases them so you're not bleeding wages on a job that can't progress). The job stays On-Hold and
 *  its deadline keeps ticking. */
export function hold(state, player, jobId) {
  const job = findJob(player, jobId);
  if (!["Active", "OnHold"].includes(job.state)) throw new GameError(`${job.name} is ${job.state} — no crew to free`);
  if (job.assigned_tradesmen.length === 0) throw new GameError(`${job.name} has no crew to free`);
  freeTradesmen(player, job);
  job.state = "OnHold";
  return `${player.name} freed the crew from ${job.name} (${job.id}) — its clock keeps ticking`;
}

/** Take a held job off hold — back to the queue, ready to staff again (Active once crew + gear return). */
export function resume(state, player, jobId) {
  const job = findJob(player, jobId);
  if (job.state !== "OnHold") throw new GameError(`${job.name} is ${job.state} — only held jobs can be resumed`);
  refreshState(state, player, job); // re-staffed → Active; otherwise back to Queued
  return `${player.name} took ${job.name} (${job.id}) off hold — now ${job.state}`;
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
/** A civic (political) job delivered: the Mayor owes favours — to the lead, and a cut to the sub. */
function grantPoliticalReward(state, lead, sub, job) {
  const n = job.favor_reward ?? 2;
  for (let i = 0; i < n; i++) lead.hand.push({ id: "favor", type: "favor", name: "Favor" });
  let line = `🏛️ civic project "${job.name}" delivered — ${lead.name} is owed ${n} Favor(s)`;
  if (sub && sub !== lead) { sub.hand.push({ id: "favor", type: "favor", name: "Favor" }); line += `; ${sub.name} earns a Favor for the assist`; }
  state.log.push(line);
}

/** A civic job that COLLAPSES drops a town-wide penalty on everyone. Returns the announcement. */
function failPolitical(state, job) {
  if (!job.political || !job.global_penalty) return null;
  return applyGlobal(state, job.global_penalty, job.name);
}

function botchRoutedJob(state, contractor, job) {
  if (!job.hirer_id) return null;
  const hirer = state.players.find((p) => p.id === job.hirer_id);
  if (!hirer) return null;
  hirer.payables = hirer.payables.filter((a) => a.job_id !== job.id); // the undelivered work is off the books
  // A botched sub costs the GC their lost markup (value − sub_cost); a plain routed job, the value.
  const dmg = job.subcontract ? Math.max(1, job.value - (job.sub_cost ?? 0)) : job.value;
  // Damages are RECOVERED to the GC/hirer (recipientId) — they lost the commission and can sue to get it
  // back (capped by what the contractor can cover); they no longer just sink to the bank.
  state.pendingDamages.push({
    hirerId: hirer.id, contractorId: contractor.id, jobId: job.id, jobName: job.name,
    value: dmg, window: state.economy.sue_window, recipientId: hirer.id,
  });
  return `↳ ${contractor.name} walked off ${hirer.name}'s ${job.name} — ${hirer.name} is out ${w(dmg)} (lost commission); they may sue ${contractor.name} to recover it`;
}

// --- Upkeep: clocks + expiry ------------------------------------------------------------

/**
 * Expire any of the player's not-complete jobs whose deadline has passed. Queue-expiry is
 * silent (no penalty); a started job expiring late is flagged exposed. Returns log lines.
 */
// The per-player CLEANUP phase (Stage: stack rules). Runs at END of a player's turn, AFTER Progress
// — so a job has its whole deadline turn to finish. HARD deadline: due turn N, gone if not Complete
// by the end of turn N (state.turn >= deadline_turn). Effect-driven removal (a Favor) is separate and
// resolves in the stack mid-turn; this only sweeps cards that aged out. Expired cards → the discard pile.
export function expireOverdue(state, player) {
  const lines = [];
  for (const job of player.jobs) {
    if (job.state === "Expired" || job.state === "Complete") continue;
    if (job.project_id) continue; // project phases live or die by the PROJECT deadline (tickProjects)
    if (state.turn >= job.deadline_turn) {
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
      if (job.routed_id) onRoutedPortionBotch(state, job); // a portion fell through → the GC contract collapses
      if (job.readying) { const r = onReadyingBotch(state, player, job); if (r) lines.push(r); } // a fit-out fell through (yours or a rival's) → the move collapses; sue a staller
      if (job.incident_id) { const r = onIncidentTenderBotch(state, player, job); if (r) lines.push(r); } // a tender stalled → the PM loses the fee + may sue
      const town = failPolitical(state, job);
      if (town) lines.push(town);
    }
  }
  // Expired jobs leave the queue once reported — into the discard pile (they never return to play).
  const gone = player.jobs.filter((j) => j.state === "Expired");
  if (gone.length && state.discard) state.discard.push(...gone);
  player.jobs = player.jobs.filter((j) => j.state !== "Expired");
  return lines;
}

// --- Job progress: burn work, complete on time ------------------------------------------

/**
 * Phase 4 — burn work on every Active job and complete those that finish (on time by
 * construction; overdue jobs were expired at upkeep). Each assigned worker burns at THEIR assigned
 * tool's speed (model A), else base_hand_speed; a trained crew adds a little, code violations shave
 * a little. Returns log lines.
 */
export function runJobProgress(state, player) {
  const lines = [];
  // Heal any worker left bare-handed while a tool sits idle (e.g. gear freed by a retirement, or
  // bought before the worker was hired) — so existing jobs pick up your gear too, not just new ones.
  for (const job of player.jobs) for (const tid of job.assigned_tradesmen) autoEquip(state, player, tid);
  // Re-evaluate states first: a job auto-held for missing tools/shop earlier this turn (its
  // crew is still assigned) promotes to Active now that you've geared up or relocated.
  for (const job of player.jobs) refreshState(state, player, job);
  const active = player.jobs.filter((j) => j.state === "Active");
  if (active.length === 0) return lines;

  // Each assigned worker burns at the speed of the tool ASSIGNED to them (model A), else by hand.
  const burnByJob = new Map();
  for (const job of active) {
    for (const tid of job.assigned_tradesmen) {
      burnByJob.set(job, (burnByJob.get(job) ?? 0) + workerProductivity(state.economy, player, tid));
    }
  }

  // A trained crew burns a little faster — add the bonus across active jobs.
  let boost = trainingSpeedBonus(player);
  for (const job of active) {
    if (boost <= 0) break;
    burnByJob.set(job, (burnByJob.get(job) ?? 0) + 1);
    boost -= 1;
  }

  // Unfixed code violations drag work off the floor — shave the penalty across active jobs.
  let drag = defectPenalty(player);
  for (const job of active) {
    if (drag <= 0) break;
    const cut = Math.min(burnByJob.get(job) ?? 0, drag);
    burnByJob.set(job, (burnByJob.get(job) ?? 0) - cut);
    drag -= cut;
  }

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
        if (job.project_id) { lines.push(...onPhaseFailed(state, job)); continue; } // a phase fails → the project collapses now
        const owed = botchRoutedJob(state, player, job);
        if (owed) lines.push(owed);
        if (job.routed_id) onRoutedPortionBotch(state, job); // a portion fell through → the GC contract collapses
        if (job.readying) { const r = onReadyingBotch(state, player, job); if (r) lines.push(r); } // a fit-out fell through (yours or a rival's) → the move collapses; sue a staller
        if (job.incident_id) { const r = onIncidentTenderBotch(state, player, job); if (r) lines.push(r); } // a tender stalled → the PM loses the fee + may sue
        const town = failPolitical(state, job);
        if (town) lines.push(town);
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
  if (e.cost) { cashOut(state, player, ACCT.COGS_SUB, e.cost, "Job overrun"); parts.push(`cost ${e.cost}W`); }
  if (e.deadline) { job.deadline_turn += e.deadline; parts.push(`deadline ${e.deadline > 0 ? "+" : ""}${e.deadline}`); }
  return parts.join(", ");
}

function completeJob(state, player, job) {
  job.state = "Complete";
  // Dot's good word: finishing her job seeds fresh work into your deck (the anti-Hettrick).
  if (job.npc === "dot" && womFires(state, "dot")) injectById(state, player, "j2", state.economy.dot_referral_jobs ?? 3, `Dot's good word (${job.name})`);
  if (job.civic_id) onCivicContractComplete(state, player, job); // mark the town contract; PM bonus when all land
  freeTradesmen(player, job);
  player.jobs = player.jobs.filter((j) => j.id !== job.id);
  const terms = job.terms ?? state.economy.invoice_terms; // payment terms (longer = paid later)
  if (job.routed_id) {
    // A portion of a 3-trade GC contract: a routed (rival) portion's AP comes due net-30; the
    // CONTRACT bills the client net-90 when every portion lands — no per-portion invoice here.
    if (job.hirer_id) {
      const hirer = state.players.find((p) => p.id === job.hirer_id);
      const ap = hirer?.payables.find((a) => a.job_id === job.id);
      if (ap) { ap.pending = false; ap.due_turn = state.turn + terms; }
    }
    onRoutedPortionComplete(state, job);
    return;
  }
  if (job.project_id) {
    // A phase of a larger project. Pay the sub if it was subbed out; the PROJECT books the customer
    // money (deposit + balance), not a per-phase invoice.
    if (job.hirer_id) {
      const lead = state.players.find((p) => p.id === job.hirer_id);
      const ap = lead?.payables.find((a) => a.job_id === job.id);
      if (ap) { ap.pending = false; ap.due_turn = state.turn + terms; }
    }
    onPhaseComplete(state, job);
    return;
  }
  if (job.hirer_id) {
    // Routed/subcontract job delivered: the hirer's pending AP now comes DUE — they pay the
    // contractor (this player) the sub_cost, or refuse and face a suit.
    const hirer = state.players.find((p) => p.id === job.hirer_id);
    const ap = hirer?.payables.find((a) => a.job_id === job.id);
    if (ap) { ap.pending = false; ap.due_turn = state.turn + terms; }
    if (job.subcontract && hirer) {
      // The GC delivers to the customer: book their marked-up invoice (collects later, or factor
      // it). Gross margin = this revenue (value) − the COGS_SUB they pay the sub = the markup.
      hirer.invoices.push(createInvoice(job, state.turn, terms));
      accrue(state, hirer, ACCT.AR, ACCT.REVENUE, job.value, `Subcontracted job delivered: ${job.name}`);
      if (job.political) grantPoliticalReward(state, hirer, player, job); // favours: the lead + the sub
    }
  } else {
    player.invoices.push(createInvoice(job, state.turn, terms));
    // Accrual: revenue is EARNED now (Dr AR / Cr revenue) — cash arrives later when the invoice
    // collects. That gap is the lesson: you can be profitable on paper and short on cash.
    accrue(state, player, ACCT.AR, ACCT.REVENUE, job.value, `Job earned: ${job.name}`);
    if (job.political) grantPoliticalReward(state, player, null, job); // a civic job you did yourself
  }
  if (job.incident_id) onIncidentTenderComplete(state, job); // mini-PM contract: pay the PM fee when all tenders land
}

/**
 * Sell a job to the bank instead of doing it — a small immediate payout to cut your losses on
 * a job you can't (or won't) staff. Frees the crew. Routed jobs can't be sold (they're not
 * yours to sell — they belong to the hirer relationship).
 */
export function sellJob(state, player, jobId) {
  const job = findJob(player, jobId);
  if (job.hirer_id) throw new GameError(`${job.name} is a routed job — you can't sell it`);
  if (!job.droppable) throw new GameError(`${job.name} is a sticky job — you can't sell your way out of it`); // mandatory jobs (Chief Boon) can't be dropped OR sold
  if (job.state === "Complete" || job.state === "Expired") throw new GameError(`${job.name} is ${job.state}`);
  const payout = Math.max(1, Math.floor(job.value * state.economy.sell_rate));
  freeTradesmen(player, job);
  player.jobs = player.jobs.filter((j) => j.id !== jobId);
  cashIn(state, player, ACCT.OTHER_INCOME, payout, `Sold ${job.name}`);
  return `${player.name} sold ${job.name} (${job.id}) to the bank for ${w(payout)} rather than let it expire`;
}

/** Did a routed job just complete? (For the contractor's completion log line.) */
function completionNote(state, job) {
  if (job.hirer_id) {
    const hirer = state.players.find((p) => p.id === job.hirer_id);
    const owed = job.subcontract ? job.sub_cost : job.value;
    return `delivered for ${hirer?.name ?? "the hirer"} — they owe you ${w(owed)} (collects when they pay)`;
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
    cashIn(state, player, ACCT.AR, inv.amount, `Collect invoice ${inv.id}`); // Dr cash / Cr AR
    lines.push(`💵 ${player.name} collected invoice ${inv.id} for ${w(inv.amount)}`);
  }
  player.invoices = player.invoices.filter((inv) => state.turn < inv.due_turn);
  return lines;
}
