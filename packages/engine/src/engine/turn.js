// Turn flow for Stage 1. The full turn structure (starter spec) is:
//   1. Upkeep  2. Draw  3. Actions  4. Job progress  5. End
// Stage 1 implements the bookends — Upkeep and End — plus the Actions phase (driven by the
// UI calling shop.js). Draw and Job-progress arrive with the decks in later stages.
//
// The engine enforces forced transactions and timers: upkeep is non-optional, it is charged
// the moment a player's turn begins, and a player who cannot cover overhead goes bankrupt —
// that is the "run a shop into the ground" failure state.

import { findBuilding, findEquipment, w } from "./economy.js";
import { collectInvoices } from "./jobs.js";
import { processDuePayables, clearPayable } from "./payables.js";
import { tickDefects } from "./defects.js";
import { tickModifiers, chargeInterest, premiumsFor } from "./modifiers.js";
import { tickExpansion } from "./expansion.js";
import { chargeLevy, tickGlobals, levyDue } from "./globals.js";
import { tickProjects, settleProjectsForBankrupt } from "./projects.js";
import { tickCivics, settleCivicsForBankrupt } from "./civics.js";
import { returnCrew, tickTheftEscalation } from "./crew.js";
import { post, balances, ACCT } from "../state/ledger.js";

/** Total recurring overhead a player owes each turn: rent + wages + rented-equipment fees. */
export function overheadFor(state, player) {
  // While readying a MOVE you pay the NEW building's (higher) rent immediately — so dragging out the
  // fit-out really bites. Capacity stays the old shop's until you actually move in.
  const pe = player.pendingExpansion;
  const rentBuilding = pe && !pe.isImprove && pe.target ? findBuilding(state.economy, pe.target) : findBuilding(state.economy, player.building);
  const rent = rentBuilding.rent;
  const wages = player.tradesmen.length * state.economy.wage_per_turn;
  const equipmentFees = player.equipment
    .filter((e) => !e.owned)
    .reduce((sum, e) => sum + findEquipment(state.economy, e.defId).rent_per_turn, 0);
  return { rent, wages, equipmentFees, total: rent + wages + equipmentFees };
}

/**
 * The full recurring cost of running this shop next turn — for the turn-start executive summary.
 * Beyond base overhead it folds in standing-service premiums, code-violation fines, line-of-credit
 * interest, and any town levy in force, plus the crew/capacity headline.
 */
export function recurringExpenses(state, player) {
  const o = overheadFor(state, player);
  const premiums = premiumsFor(player);
  const fines = (player.defects ?? []).reduce((s, d) => s + (d.fine ?? 0), 0);
  const owed = -(balances(player)[ACCT.LOC] || 0);
  const interest = owed > 0 ? Math.ceil(owed * state.economy.line_of_credit.interest) : 0;
  const levy = levyDue(state);
  const capacity = findBuilding(state.economy, player.building).capacity + (player.capacityBonus ?? 0);
  return {
    rent: o.rent, wages: o.wages, equipment: o.equipmentFees, premiums, fines, interest, levy,
    total: o.rent + o.wages + o.equipmentFees + premiums + fines + interest + levy,
    crew: player.tradesmen.length, capacity,
  };
}

/**
 * Phase 1 — Upkeep. Advance the deadline clocks (expire overdue jobs), collect matured
 * invoices (income arrives before bills), then charge overhead. If overhead drives cash below
 * zero the player is marked bankrupt (out of the game). Returns a breakdown for the UI.
 */
export function runUpkeep(state, player) {
  player.relocatedThisTurn = false;
  player.hiredThisTurn = false;
  player.acquiredEquipThisTurn = false;
  player.bbbThisTurn = false; // reset before the draw, which may re-arm it via a BBB Special
  const lines = [];
  lines.push(...returnCrew(state, player)); // bring back anyone whose time out has elapsed
  lines.push(...tickTheftEscalation(state, player)); // a kept thief keeps stealing (capped)
  lines.push(...tickProjects(state, player)); // collapse any of this lead's projects past deadline
  // NOTE: overdue jobs no longer expire here — that moved to the end-of-turn CLEANUP phase
  // (game.endTurn → expireOverdue, hard deadline) so a job has its whole deadline turn to finish.
  lines.push(...collectInvoices(state, player));
  lines.push(...processDuePayables(state, player));
  // Damages claims (player v. player) no longer expire on a timer — they stay open the whole game
  // until sued, settled, or a Favor closes them (see game.js litigation). So no tick here.
  lines.push(...tickDefects(state, player));
  lines.push(...tickModifiers(state, player)); // premiums for insurance/marketing etc.
  lines.push(...chargeInterest(state, player, state.economy.line_of_credit.interest));
  lines.push(...tickExpansion(state, player)); // a readied move-in: pay the balance, capitalise, move
  lines.push(...chargeLevy(state, player)); // a town levy in force (a failed civic job) hits every shop

  const o = overheadFor(state, player);
  post(state, player, "Upkeep — overhead", [
    { acct: ACCT.RENT, amt: o.rent },
    { acct: ACCT.COGS_LABOUR, amt: o.wages },
    { acct: ACCT.COGS_EQUIP, amt: o.equipmentFees },
    { acct: ACCT.CASH, amt: -o.total },
  ]);
  lines.push(
    `Upkeep for ${player.name}: rent ${w(o.rent)} + wages ${w(o.wages)} + equipment ${w(o.equipmentFees)} = ${w(o.total)}`,
  );
  if (player.cash < 0 && !player.bankrupt) {
    player.bankrupt = true;
    lines.push(`💀 ${player.name} cannot cover overhead (${w(player.cash)}) and is BANKRUPT — out of the game.`);
    lines.push(...settleBankruptcy(state, player));
  }
  return { overhead: o, lines };
}

/**
 * Wind up a folded shop's estate through the bank/steward so nothing dangles AND no rival catches a
 * break — folding mustn't be a free escape hatch for the rest of the table:
 *  • RECEIVABLES — what rivals owed X — are COLLECTED in full by the bank (no forgiven debt).
 *  • PAYABLES — what X owed — are PAID in full by the bank (creditors are made whole, not stiffed).
 *  • Contracts X was building for hirers are DELIVERED by the bank (the hirer pays for the work).
 *  • Civic + project obligations are taken over by the county/bank so shared contracts still deliver
 *    (no town penalty for a default nobody could prevent) — see settleCivics/ProjectsForBankrupt.
 *  • LAWSUITS touching X are resolved: the estate offers 50% to settle; refused, it's a coin-flip in
 *    court — the whole claim or nothing, plus a 1W legal fee. The bank stands in for the folded shop.
 *  • X's own jobs/invoices/defects and any in-flight litigation UI state are then cleared.
 * (clearPayable settles an accrued bill on BOTH sides at the given cashAmt; a pending/undelivered one
 *  is simply removed — so paying the full amount collects/pays real debts and voids un-earned ones.)
 */
function settleBankruptcy(state, x) {
  const lines = [];

  // 1. RECEIVABLES — what rivals owed X: the bank collects in full, so a fold isn't a free pass.
  for (const p of state.players) {
    if (p === x) continue;
    let took = 0;
    for (const ap of p.payables.filter((a) => a.creditor_id === x.id)) {
      if (ap.accrued) took += ap.amount;
      clearPayable(state, p, ap, { cashAmt: ap.amount, reason: "Estate collects" });
    }
    if (took) lines.push(`   ↳ the bank collects ${p.name}'s ${w(took)} owed to ${x.name}`);
  }

  // 2. PAYABLES — what X owed others: the bank pays in full, so creditors aren't stiffed.
  let paid = 0;
  for (const ap of [...x.payables]) {
    if (ap.accrued && ap.creditor_id && ap.creditor_id !== x.id) paid += ap.amount;
    clearPayable(state, x, ap, { cashAmt: ap.amount, reason: "Estate pays" });
  }
  if (paid) lines.push(`   ↳ the bank settles ${x.name}'s ${w(paid)} owed to the table`);
  x.payables = [];

  // 3a. Contracts X was building for hirers → the bank delivers; the hirer pays for the finished work.
  for (const job of x.jobs.filter((j) => j.hirer_id)) {
    const hirer = state.players.find((p) => p.id === job.hirer_id);
    if (!hirer) continue;
    const owed = hirer.payables.filter((a) => a.job_id === job.id);
    for (const ap of owed) clearPayable(state, hirer, ap, { cashAmt: ap.amount, reason: "Estate delivers" });
    if (owed.length) lines.push(`   ↳ the bank delivers ${x.name}'s ${job.name} — ${hirer.name} pays ${w(job.value)} for the work`);
  }
  // Contracts OTHERS were building for X → drop them + free crew (their accrued pay came via step 2).
  for (const p of state.players) {
    if (p === x) continue;
    const voided = p.jobs.filter((j) => j.hirer_id === x.id);
    for (const job of voided) for (const tid of job.assigned_tradesmen) { const tm = p.tradesmen.find((w) => w.id === tid); if (tm) tm.assignedJob = null; }
    if (voided.length) { p.jobs = p.jobs.filter((j) => j.hirer_id !== x.id); lines.push(`   ↳ ${p.name}'s ${voided.length} contract(s) for ${x.name} close out (paid via the estate)`); }
  }

  // 3b. Civic + project obligations → taken over by the county/bank so shared contracts still deliver.
  lines.push(...settleCivicsForBankrupt(state, x));
  lines.push(...settleProjectsForBankrupt(state, x));

  // 4. LAWSUITS touching X → handed to the bank/steward as ESTATE CLAIMS. On each live counterparty's
  //    OWN turn they choose: settle for 50%, or refuse → immediate court (the full claim or nothing,
  //    plus a 1W legal fee). The bank stands in for the folded shop — postings hit only the live party.
  const HALF = (n) => Math.max(1, Math.ceil(n / 2));
  state.estateClaims ??= [];
  const mine = state.pendingDamages.filter((c) => c.contractorId === x.id || (c.recipientId ?? c.hirerId) === x.id);
  for (const c of mine) {
    const claim = c.value ?? 0;
    if (claim <= 0) continue;
    if (c.contractorId === x.id) {
      // X was the defendant → a live plaintiff is OWED by the estate (they may receive).
      const plaintiff = state.players.find((p) => p.id === (c.recipientId ?? c.hirerId) && !p.bankrupt);
      if (plaintiff) {
        state.estateClaims.push({ id: `est${++state.estateSeq}`, fromName: x.name, jobName: c.jobName, value: claim, partyId: plaintiff.id, owes: false, settle: HALF(claim) });
        lines.push(`   ⚖️ ${plaintiff.name}'s ${c.jobName} claim passes to the bank — settle or court on their next turn`);
      }
    } else {
      // X was the plaintiff → a live defendant OWES the estate (they may pay).
      const defendant = state.players.find((p) => p.id === c.contractorId && !p.bankrupt);
      if (defendant) {
        state.estateClaims.push({ id: `est${++state.estateSeq}`, fromName: x.name, jobName: c.jobName, value: claim, partyId: defendant.id, owes: true, settle: HALF(claim) });
        lines.push(`   ⚖️ ${x.name}'s estate will pursue ${defendant.name} over ${c.jobName} — settle or court on their next turn`);
      }
    }
  }
  state.pendingDamages = state.pendingDamages.filter((c) => !mine.includes(c));

  // 5. Wipe X's remaining books + any in-flight litigation UI state still pointing at X.
  x.invoices = [];
  x.jobs = [];
  x.defects = [];
  state.estateClaims = state.estateClaims.filter((c) => c.partyId !== x.id); // a now-folded party can't answer an estate claim
  state.pendingCourt = state.pendingCourt.filter((c) => c.playerId !== x.id);
  state.pendingSettle = state.pendingSettle.filter((c) => c.playerId !== x.id);
  state.pendingThreat = state.pendingThreat && [state.pendingThreat.ownerId, state.pendingThreat.debtorId, state.pendingThreat.contractorId].includes(x.id) ? null : state.pendingThreat;

  return lines;
}

/** True once every player is bankrupt — the game cannot continue. */
export function allBankrupt(state) {
  return state.players.every((p) => p.bankrupt);
}

/**
 * Phase 5 — End. Advance to the next solvent player; when the round wraps past the last
 * player, increment the turn counter. Ends the game after round `max_turns` completes or
 * when everyone is bankrupt. Returns { player } for the next active player, or null if over.
 */
export function advance(state) {
  if (state.over) return null;

  const n = state.players.length;
  for (let step = 0; step < n; step++) {
    state.roundPos = (state.roundPos ?? 0) + 1;
    if (state.roundPos >= n) {
      state.roundPos = 0;
      state.turn++;
      state.log.push(...tickGlobals(state)); // a new round — age out any town-wide effects
      state.log.push(...tickCivics(state)); // a civic build past deadline penalises the whole town
      if (state.turn > state.economy.max_turns) {
        state.over = true;
        return null;
      }
    }
    // The round's lead-off rotates one seat clockwise each round when rotate is on; off → always seat 0
    // (the legacy order, so tests/tuning are unchanged). Within a round, play proceeds clockwise from the lead.
    const lead = state.rotate ? (state.firstSeat + state.turn - 1) % n : 0;
    state.activePlayerIndex = (lead + state.roundPos) % n;
    const candidate = state.players[state.activePlayerIndex];
    if (!candidate.bankrupt) {
      if (allBankrupt(state)) break;
      return { player: candidate };
    }
  }

  if (allBankrupt(state)) state.over = true;
  return state.over ? null : { player: state.players[state.activePlayerIndex] };
}

/** Final standings: solvent players ranked by cash, then bankrupt players. */
export function results(state) {
  const ranked = [...state.players].sort((a, b) => {
    if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
    return b.cash - a.cash;
  });
  return ranked.map((p, i) => ({
    place: i + 1,
    name: p.name,
    service: p.service,
    cash: p.cash,
    bankrupt: p.bankrupt,
  }));
}
