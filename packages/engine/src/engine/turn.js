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
  const lines = [];
  lines.push(...expireOverdue(state, player));
  lines.push(...collectInvoices(state, player));
  lines.push(...processDuePayables(state, player));

  const o = overheadFor(state, player);
  player.cash -= o.total;
  lines.push(
    `Upkeep for ${player.name}: rent ${w(o.rent)} + wages ${w(o.wages)} + equipment ${w(o.equipmentFees)} = ${w(o.total)}`,
  );
  if (player.cash < 0 && !player.bankrupt) {
    player.bankrupt = true;
    lines.push(`💀 ${player.name} cannot cover overhead (${w(player.cash)}) and is BANKRUPT — out of the game.`);
  }
  return { overhead: o, lines };
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
