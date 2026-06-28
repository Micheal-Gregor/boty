// Civic jobs — a contract to the WHOLE town (JOB-CARDS-PLAN B5). On draw, every solvent player gets
// one sub-contract sized by their shop (garage→2-person/8W, shop→3-person/12W, warehouse→4-person/
// 16W); the drawer is project manager. Deliver them ALL by the deadline and the PM takes a 20% bonus
// + favours; blow it and the whole town eats a global penalty (the existing levy layer). Empty slots
// (a bankrupt shop) are covered by the county. This replaces the old "drawer does every phase".

import { createJob } from "../state/state.js";
import { cashIn, ACCT } from "../state/ledger.js";
import { applyGlobal } from "./globals.js";
import { findBuilding, w } from "./economy.js";
import { seasonName } from "./season.js";

export function resetCivics() {} // ids are now per-state (state.civicSeq) — reset with the state, lockstep-safe

// Contract size by the player's building tier.
const CONTRACT = { 1: { crew: 2, value: 8 }, 2: { crew: 3, value: 12 }, 3: { crew: 4, value: 16 } };

/** One sub-contract per solvent player; the drawer is PM. Returns the announcement line. */
export function startCivic(state, drawer, card) {
  state.civicSeq = (state.civicSeq ?? 0) + 1;
  const id = `CV${state.civicSeq}`;
  // Match fortune.js's art keying: a seasonal storm follows the season; everything else is by id.
  const art = card.art ?? (card.seasonal_storm ? `civic/storm/${seasonName(state).toLowerCase()}` : `civic/${card.id}`);
  const penalty = card.global_penalty ?? { name: `${card.name} overrun`, kind: "levy", magnitude: 1, turns: 3 };
  const civic = {
    id, name: card.name, art, pm_id: drawer.id,
    deadline_turn: state.turn + (card.deadline ?? 4),
    favor_reward: card.favor_reward ?? 2,
    global_penalty: { ...penalty, art: penalty.art ?? art }, // the levy it spawns shows the civic's own art (e.g. the storm)
    contracts: [],
  };
  let bank = 0;
  for (const p of state.players) {
    if (p.bankrupt) { bank++; continue; }
    const tier = findBuilding(state.economy, p.building).tier ?? 1;
    const spec = CONTRACT[tier] ?? CONTRACT[1];
    const job = createJob({
      id: card.id, name: `${card.name} — ${p.name}'s share`, value: spec.value,
      work_amount: spec.crew + 2, deadline: card.deadline ?? 4, terms: 2,
      min_tradesmen: 1, max_tradesmen: spec.crew, droppable: false, civic_id: id, art,
    }, state.turn);
    p.jobs.push(job);
    civic.contracts.push({ player_id: p.id, job_id: job.id, value: spec.value, done: false });
  }
  state.civics.push(civic);
  return `🏛️ the town breaks ground on ${card.name} — every shop takes a contract sized to its shop; ${drawer.name} is project manager (a 20% bonus + favours if it ALL delivers)${bank ? `; the county covers ${bank} slot(s)` : ""}`;
}

/** A civic contract delivered → mark it; when every contract is in, the PM earns the bonus + favours. */
export function onCivicContractComplete(state, player, job) {
  const civic = (state.civics ?? []).find((c) => c.id === job.civic_id);
  if (!civic) return;
  const c = civic.contracts.find((x) => x.job_id === job.id);
  if (c) c.done = true;
  if (!civic.contracts.every((x) => x.done)) return;
  const total = civic.contracts.reduce((s, x) => s + x.value, 0);
  const bonus = Math.round(total * 0.2);
  const pm = state.players.find((p) => p.id === civic.pm_id);
  if (pm && !pm.bankrupt) {
    cashIn(state, pm, ACCT.OTHER_INCOME, bonus, `PM bonus — ${civic.name}`);
    for (let i = 0; i < (civic.favor_reward ?? 0); i++) pm.hand.push({ id: "favor", type: "favor", name: "Favor" });
    state.log.push(`🏛️ ${civic.name} delivered in full — ${pm.name} (PM) takes a ${w(bonus)} bonus + ${civic.favor_reward} favour(s)`);
  } else {
    state.log.push(`🏛️ ${civic.name} delivered in full.`);
  }
  state.civics = state.civics.filter((x) => x.id !== civic.id);
}

/** Round wrap: a civic that blew its deadline penalises the whole town (the global-card layer). */
export function tickCivics(state) {
  const lines = [];
  for (const civic of [...(state.civics ?? [])]) {
    if (state.turn <= civic.deadline_turn) continue;
    const pm = state.players.find((x) => x.id === civic.pm_id);
    for (const c of civic.contracts) {
      if (c.done) continue;
      const p = state.players.find((x) => x.id === c.player_id);
      const job = p?.jobs.find((j) => j.id === c.job_id);
      if (job) for (const tid of job.assigned_tradesmen) { const t = p.tradesmen.find((x) => x.id === tid); if (t) t.assignedJob = null; }
      if (p) p.jobs = p.jobs.filter((j) => j.id !== c.job_id);
      // The PM lost their (sizable) bonus because this contractor defaulted → may sue them for the
      // share value, recovered to the PM (capped at what they can pay). Not against the PM's own slot.
      if (pm && !pm.bankrupt && p && !p.bankrupt && c.player_id !== civic.pm_id) {
        state.pendingDamages.push({ hirerId: civic.pm_id, contractorId: c.player_id, jobId: `${civic.id}_${c.player_id}`, jobName: `${civic.name} (defaulted share)`, value: c.value, recipientId: civic.pm_id });
        lines.push(`⚖️ ${pm.name} may sue ${p.name} for defaulting on ${civic.name} (${w(c.value)} in damages)`);
      }
    }
    lines.push(applyGlobal(state, civic.global_penalty, civic.name));
    state.civics = state.civics.filter((x) => x.id !== civic.id);
  }
  return lines;
}
