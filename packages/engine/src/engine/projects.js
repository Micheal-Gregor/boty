// Phased story-projects — the marquee jobs (the Opera House, the County Hospital). A big contract
// split into 2–3 PHASES worked in PARALLEL: some you do yourself, some you sub out to a trade. The
// customer pays a 50% DEPOSIT up front (a deferred-revenue liability until earned) and the balance
// only when EVERY phase is delivered. Land it and the Mayor owes favours all round; let it collapse
// past its deadline and you forfeit the balance — and, if it's a civic project, the whole town pays.
//
// Each phase is an ordinary job in its holder's queue (so the normal job loop runs them in
// parallel); this module is just the coordinator that tracks the phases and the staged money.

import { GameError, w } from "./economy.js";
import { createJob, createPayable } from "../state/state.js";
import { cashIn, accrue, ACCT } from "../state/ledger.js";
import { applyGlobal } from "./globals.js";

export function resetProjects() {} // ids are now per-state (state.projectSeq) — lockstep-safe
const byId = (state, id) => state.players.find((p) => p.id === id);
const favorCard = () => ({ id: "favor", type: "favor", name: "Favor" });

/** Take on a phased project: collect the deposit, spawn the phase jobs (self + subbed). */
export function startProject(state, lead, card) {
  const value = card.value;
  const deposit = Math.round(value * (card.deposit_fraction ?? 0.5));
  const balance = value - deposit;
  state.projectSeq = (state.projectSeq ?? 0) + 1;
  const project = {
    id: `${card.id}#${state.projectSeq}`, name: card.name, leadId: lead.id, value, deposit, balance,
    deadlineTurn: state.turn + (card.deadline ?? 6),
    political: card.political ?? false, favor_reward: card.favor_reward ?? 0, global_penalty: card.global_penalty ?? null,
    phases: [],
  };
  if (deposit > 0) cashIn(state, lead, ACCT.DEFERRED_REV, deposit, `${card.name} — 50% deposit (unearned)`);

  for (const ph of card.phases) {
    let holder = lead, hirer = null, subId = null;
    if (ph.trade && lead.service !== ph.trade) {
      const sub = state.players.find((p) => p !== lead && !p.bankrupt && p.service === ph.trade);
      if (sub) { holder = sub; hirer = lead; subId = sub.id; }
    }
    const phaseValue = hirer ? (ph.sub_cost ?? 0) : Math.max(1, Math.round(value / card.phases.length));
    const job = createJob(
      { id: `${card.id}_${ph.trade ?? "self"}`, name: `${card.name}: ${ph.name}`, value: phaseValue, work_amount: ph.work_amount, deadline: (card.deadline ?? 6) + 2, terms: 1, min_tradesmen: 1, max_tradesmen: ph.max_tradesmen ?? 2, required_equipment: null, droppable: true },
      state.turn,
    );
    job.project_id = project.id;
    if (hirer) {
      job.hirer_id = hirer.id;
      const ap = createPayable({ vendor: `${holder.name} (${card.name}: ${ph.name})`, amount: ph.sub_cost, dueTurn: null, isNpc: false, creditorId: holder.id, jobId: job.id, pending: true });
      ap.project_id = project.id;
      hirer.payables.push(ap);
    }
    holder.jobs.push(job);
    project.phases.push({ jobId: job.id, name: ph.name, trade: ph.trade ?? null, subId, done: false });
  }

  state.projects.push(project);
  const subbed = project.phases.filter((p) => p.subId).length;
  return `🏛️ ${lead.name} lands "${card.name}" (${w(value)}, ${card.phases.length} phases) — takes the ${w(deposit)} deposit now; ${subbed} phase(s) subbed out; the ${w(balance)} balance lands when it's all delivered`;
}

/** A phase job finished — mark it, and finish the project once every phase is in. */
export function onPhaseComplete(state, job) {
  const project = state.projects.find((p) => p.id === job.project_id);
  if (!project) return;
  const phase = project.phases.find((ph) => ph.jobId === job.id);
  if (phase) phase.done = true;
  const done = project.phases.filter((p) => p.done).length;
  state.log.push(`  ↳ "${project.name}" — ${phase?.name ?? "a phase"} delivered (${done}/${project.phases.length})`);
  if (project.phases.every((ph) => ph.done)) completeProject(state, project);
}

function completeProject(state, project) {
  const lead = byId(state, project.leadId);
  if (project.deposit > 0) accrue(state, lead, ACCT.DEFERRED_REV, ACCT.REVENUE, project.deposit, `${project.name} — deposit earned`);
  if (project.balance > 0) cashIn(state, lead, ACCT.REVENUE, project.balance, `${project.name} — final payment`);
  let line = `🏛️ ${lead.name} DELIVERED "${project.name}" — collects the ${w(project.balance)} balance`;
  if (project.political) {
    for (let i = 0; i < (project.favor_reward ?? 2); i++) lead.hand.push(favorCard());
    for (const sid of [...new Set(project.phases.map((p) => p.subId).filter(Boolean))]) {
      const sub = byId(state, sid);
      if (sub) sub.hand.push(favorCard());
    }
    line += ` — the Mayor owes favours all round`;
  }
  state.projects = state.projects.filter((p) => p.id !== project.id);
  state.log.push(line);
}

/** Deadline blown with phases outstanding → forfeit the balance (keep the deposit), clean up, penalise. */
function failProject(state, project) {
  const lead = byId(state, project.leadId);
  if (project.deposit > 0) accrue(state, lead, ACCT.DEFERRED_REV, ACCT.REVENUE, project.deposit, `${project.name} — deposit kept (collapsed)`);
  const lines = [`✗ "${project.name}" COLLAPSED past deadline — ${lead.name} forfeits the ${w(project.balance)} balance`];
  removeProjectJobs(state, project.id);
  if (project.political && project.global_penalty) lines.push(applyGlobal(state, project.global_penalty, project.name));
  state.projects = state.projects.filter((p) => p.id !== project.id);
  return lines;
}

/** Pull every remaining phase job off the table (free crew) and void its pending sub payables. */
function removeProjectJobs(state, projectId) {
  for (const p of state.players) {
    for (const job of p.jobs.filter((j) => j.project_id === projectId)) {
      for (const tid of job.assigned_tradesmen) { const t = p.tradesmen.find((x) => x.id === tid); if (t) t.assignedJob = null; }
    }
    p.jobs = p.jobs.filter((j) => j.project_id !== projectId);
    p.payables = p.payables.filter((a) => !(a.project_id === projectId && a.pending));
  }
}

/** A phase failed outright (a decisive-failure progress card) — the whole project collapses now. */
export function onPhaseFailed(state, job) {
  const project = state.projects.find((p) => p.id === job.project_id);
  return project ? failProject(state, project) : [];
}

/** Upkeep: collapse any of this lead's projects whose deadline has passed unfinished. */
export function tickProjects(state, player) {
  const lines = [];
  for (const project of state.projects.filter((p) => p.leadId === player.id)) {
    if (state.turn > project.deadlineTurn && !project.phases.every((ph) => ph.done)) {
      lines.push(...failProject(state, project));
    }
  }
  return lines;
}
