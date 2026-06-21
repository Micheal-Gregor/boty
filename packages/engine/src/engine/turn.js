// Turn flow for Stage 1. The full turn structure (starter spec) is:
//   1. Upkeep  2. Draw  3. Actions  4. Job progress  5. End
// Stage 1 implements the bookends — Upkeep and End — plus the Actions phase (driven by the
// UI calling shop.js). Draw and Job-progress arrive with the decks in later stages.
//
// The engine enforces forced transactions and timers: upkeep is non-optional, it is charged
// the moment a player's turn begins, and a player who cannot cover overhead goes bankrupt —
// that is the "run a shop into the ground" failure state.

import { findBuilding, findEquipment, w } from "./economy.js";
import { collectInvoices, expireOverdue } from "./jobs.js";
import { processDuePayables } from "./payables.js";
import { tickDefects } from "./defects.js";
import { post, ACCT } from "../state/ledger.js";

/** Total recurring overhead a player owes each turn: rent + wages + rented-equipment fees. */
export function overheadFor(state, player) {
  const building = findBuilding(state.economy, player.building);
  const rent = building.rent;
  const wages = player.tradesmen.length * state.economy.wage_per_turn;
  const equipmentFees = player.equipment
    .filter((e) => !e.owned)
    .reduce((sum, e) => sum + findEquipment(state.economy, e.defId).rent_per_turn, 0);
  return { rent, wages, equipmentFees, total: rent + wages + equipmentFees };
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
  const lines = [];
  lines.push(...expireOverdue(state, player));
  lines.push(...collectInvoices(state, player));
  lines.push(...processDuePayables(state, player));
  lines.push(...tickDamagesClaims(state, player));
  lines.push(...tickDefects(state, player));

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
 * Unwind a folded shop's entanglements with the rest of the table so nothing dangles:
 *  • Contracts it was building FOR others (its jobs with hirer_id) die — each hirer's matching
 *    payable clears (no delivery, no debt; and it's judgment-proof, so no damages either).
 *  • Contracts others were building FOR it (their jobs with hirer_id === it) are voided too and
 *    dropped from the contractor's queue (the client is gone).
 *  • Debts it owed are written off — player creditors lose the receivable, NPC/collections die.
 *  • Debts players owed IT are forgiven (a defunct shop can't collect; already-factored debts
 *    have moved to the collections agency — creditor_id null — and are left untouched).
 *  • Its own jobs/invoices/defects and any pending litigation touching it are cleared.
 */
function settleBankruptcy(state, x) {
  const lines = [];

  // 1. Contracts X was building for others → void; clear the hirer's matching liability.
  for (const job of x.jobs.filter((j) => j.hirer_id)) {
    const hirer = state.players.find((p) => p.id === job.hirer_id);
    if (!hirer) continue;
    const before = hirer.payables.length;
    hirer.payables = hirer.payables.filter((a) => a.job_id !== job.id);
    if (hirer.payables.length < before) {
      lines.push(`   ↳ ${x.name}'s ${job.name} contract dies with the shop — ${hirer.name}'s ${w(job.value)} liability cleared`);
    }
  }

  // 2. Contracts OTHERS were building for X → void and drop from their queues (free their crew).
  for (const p of state.players) {
    if (p === x) continue;
    const voided = p.jobs.filter((j) => j.hirer_id === x.id);
    for (const job of voided) {
      for (const tid of job.assigned_tradesmen) {
        const t = p.tradesmen.find((w) => w.id === tid);
        if (t) t.assignedJob = null;
      }
    }
    if (voided.length) {
      p.jobs = p.jobs.filter((j) => j.hirer_id !== x.id);
      lines.push(`   ↳ ${p.name} loses ${voided.length} contract(s) for the folded ${x.name}`);
    }
  }

  // 3. Debts players owed X are forgiven (defunct shop can't collect).
  for (const p of state.players) {
    if (p === x) continue;
    const before = p.payables.length;
    p.payables = p.payables.filter((a) => a.creditor_id !== x.id);
    if (p.payables.length < before) lines.push(`   ↳ ${p.name}'s debt to ${x.name} is written off`);
  }

  // 4. X's own books are wiped, and any litigation touching X is dropped.
  x.payables = [];
  x.invoices = [];
  x.jobs = [];
  x.defects = [];
  state.pendingDamages = state.pendingDamages.filter((c) => c.hirerId !== x.id && c.contractorId !== x.id);
  state.pendingCourt = state.pendingCourt.filter((c) => c.playerId !== x.id);
  state.pendingSettle = state.pendingSettle.filter((c) => c.playerId !== x.id);
  state.pendingThreat = state.pendingThreat && [state.pendingThreat.ownerId, state.pendingThreat.debtorId, state.pendingThreat.contractorId].includes(x.id) ? null : state.pendingThreat;

  return lines;
}

/** Tick down the current player's damages-claim windows; drop any that expire unsued. */
function tickDamagesClaims(state, player) {
  const lines = [];
  for (const c of state.pendingDamages.filter((x) => x.hirerId === player.id)) {
    c.window -= 1;
    if (c.window <= 0) lines.push(`${player.name}'s damages claim over ${c.jobName} lapsed unsued.`);
  }
  state.pendingDamages = state.pendingDamages.filter((c) => c.hirerId !== player.id || c.window > 0);
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
    state.activePlayerIndex++;
    if (state.activePlayerIndex >= n) {
      state.activePlayerIndex = 0;
      state.turn++;
      if (state.turn > state.economy.max_turns) {
        state.over = true;
        return null;
      }
    }
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
