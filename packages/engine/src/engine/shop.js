// The shop economy: the player-driven actions of Stage 1. Each function validates the move
// against the rules and the economy data, mutates state, and returns a short human-readable
// description of what happened. Illegal moves throw GameError — the engine refuses, it does
// not silently fix. Wages and recurring fees are NOT charged here; they are charged in
// upkeep (see turn.js). These actions handle one-off costs only (sign-on, severance,
// buy, disposal).

import { GameError, findBuilding, findEquipment, w } from "./economy.js";
import { createTradesman, createEquipment } from "../state/state.js";
import { cashIn, cashOut, post, balances, ACCT } from "../state/ledger.js";

/** A building's crew capacity, plus any capitalised shop improvements the player has made. */
export function capacityOf(economy, player) {
  return findBuilding(economy, player.building).capacity + (player.capacityBonus ?? 0);
}

// --- Equipment ↔ worker assignment (model A) -------------------------------------------------
// Each tool is assigned to one tradesperson; an assigned worker burns at the tool's speed, an
// unassigned (tool-less) worker at base_hand_speed, and an IDLE tool (no worker) still costs rent
// but produces nothing — the "don't over-buy gear" lesson.

/** Put every idle tool on a tool-less worker (the sensible default after buying/hiring). */
export function autoAssignTools(player) {
  for (const eq of player.equipment) {
    if (eq.assigned_to != null) continue;
    const free = player.tradesmen.find((t) => !player.equipment.some((e) => e.assigned_to === t.id));
    if (free) eq.assigned_to = free.id;
  }
}

/** Manually put a tool on a worker (swaps off whatever each currently holds). */
export function assignEquipment(state, player, equipmentId, tradesmanId) {
  const eq = player.equipment.find((e) => e.id === equipmentId);
  if (!eq) throw new GameError(`No equipment instance "${equipmentId}"`);
  const t = player.tradesmen.find((x) => x.id === tradesmanId);
  if (!t) throw new GameError(`No tradesperson "${tradesmanId}"`);
  for (const e of player.equipment) if (e.assigned_to === t.id) e.assigned_to = null; // one tool per worker
  eq.assigned_to = t.id;
  return `${player.name} put ${t.id} on the ${findEquipment(state.economy, eq.defId).name}`;
}

export function unassignEquipment(state, player, equipmentId) {
  const eq = player.equipment.find((e) => e.id === equipmentId);
  if (!eq) throw new GameError(`No equipment instance "${equipmentId}"`);
  eq.assigned_to = null;
  return `${player.name} idled the ${findEquipment(state.economy, eq.defId).name}`;
}

function assertSolvent(player, cost, action) {
  if (player.cash < cost) {
    throw new GameError(`${player.name} cannot afford to ${action}: needs ${w(cost)}, has ${w(player.cash)}`);
  }
}

/** Hire a tradesperson. Costs the sign-on fee now; wages accrue at upkeep. */
export function hire(state, player) {
  if (player.hiredThisTurn) throw new GameError(`${player.name} can only hire one tradesperson per turn`);
  const building = findBuilding(state.economy, player.building);
  const cap = capacityOf(state.economy, player);
  if (player.tradesmen.length >= cap) {
    throw new GameError(`${building.name} is at capacity (${cap}); relocate, improve the shop, or fire before hiring`);
  }
  const fee = state.economy.sign_on_fee;
  assertSolvent(player, fee, "hire");
  cashOut(state, player, ACCT.COGS_LABOUR, fee, "Hire — sign-on fee");
  const t = createTradesman();
  player.tradesmen.push(t);
  player.hiredThisTurn = true;
  autoAssignTools(player); // hand the new hire any idle tool
  return `${player.name} hired a tradesperson (${t.id}) for a ${w(fee)} sign-on fee`;
}

/** Fire a tradesperson. Costs severance now; stops their future wages. */
export function fire(state, player, tradesmanId) {
  const idx = tradesmanId
    ? player.tradesmen.findIndex((t) => t.id === tradesmanId)
    : player.tradesmen.length - 1;
  if (idx < 0) throw new GameError(`No such tradesperson to fire`);
  const fee = state.economy.severance;
  assertSolvent(player, fee, "fire");
  cashOut(state, player, ACCT.COGS_LABOUR, fee, "Severance");
  const [removed] = player.tradesmen.splice(idx, 1);
  for (const e of player.equipment) if (e.assigned_to === removed.id) e.assigned_to = null; // free their tool
  autoAssignTools(player); // give the freed tool to another bare-handed worker
  return `${player.name} fired ${removed.id} for ${w(fee)} severance`;
}

function assertCanAcquireEquip(player) {
  if (player.acquiredEquipThisTurn) throw new GameError(`${player.name} can only acquire one piece of equipment per turn`);
}

/** Buy equipment outright (big upfront cost; dispose later at a loss). One per turn. */
export function buyEquipment(state, player, defId) {
  assertCanAcquireEquip(player);
  const def = findEquipment(state.economy, defId);
  if (!def) throw new GameError(`No equipment "${defId}"`);
  assertSolvent(player, def.buy_cost, `buy ${def.name}`);
  cashOut(state, player, ACCT.EQUIPMENT, def.buy_cost, `Buy ${def.name}`); // capital asset
  const eq = createEquipment(defId, { owned: true });
  player.equipment.push(eq);
  player.acquiredEquipThisTurn = true;
  autoAssignTools(player); // put the new tool on a bare-handed worker if there is one
  return `${player.name} bought ${def.name} (${eq.id}) for ${w(def.buy_cost)}`;
}

/** Rent equipment (no upfront cost; per-turn fee charged at upkeep; cancel anytime free). One per turn. */
export function rentEquipment(state, player, defId) {
  assertCanAcquireEquip(player);
  const def = findEquipment(state.economy, defId);
  if (!def) throw new GameError(`No equipment "${defId}"`);
  const eq = createEquipment(defId, { owned: false });
  player.equipment.push(eq);
  player.acquiredEquipThisTurn = true;
  autoAssignTools(player);
  return `${player.name} rented ${def.name} (${eq.id}) at ${w(def.rent_per_turn)}/turn`;
}

/** Dispose of OWNED equipment at the disposal rate (a real loss). */
export function disposeEquipment(state, player, instanceId) {
  const eq = player.equipment.find((e) => e.id === instanceId);
  if (!eq) throw new GameError(`No equipment instance "${instanceId}"`);
  if (!eq.owned) throw new GameError(`${eq.id} is rented — cancel it instead of disposing`);
  const def = findEquipment(state.economy, eq.defId);
  const refund = Math.floor(def.buy_cost * def.disposal_rate);
  player.equipment = player.equipment.filter((e) => e.id !== instanceId);
  cashIn(state, player, ACCT.EQUIPMENT, refund, `Dispose ${def.name}`); // reduce the asset
  return `${player.name} disposed of ${def.name} (${eq.id}) for ${w(refund)} (${Math.round(def.disposal_rate * 100)}% of market)`;
}

/** Cancel a RENTED equipment contract (free, immediate). */
export function cancelRental(state, player, instanceId) {
  const eq = player.equipment.find((e) => e.id === instanceId);
  if (!eq) throw new GameError(`No equipment instance "${instanceId}"`);
  if (eq.owned) throw new GameError(`${eq.id} is owned — dispose of it instead of cancelling`);
  const def = findEquipment(state.economy, eq.defId);
  player.equipment = player.equipment.filter((e) => e.id !== instanceId);
  return `${player.name} cancelled the rental of ${def.name} (${eq.id})`;
}

/**
 * Invest in your shop — a CAPITAL improvement, not an expense. It buys lasting crew capacity and
 * lands on the balance sheet (Dr building 1600 / Cr cash), so it never touches the P&L. The catch:
 * it's a leasehold improvement, written off if you relocate.
 */
export function improveShop(state, player) {
  const { cost, capacity } = state.economy.shop_improvement;
  assertSolvent(player, cost, "improve the shop");
  cashOut(state, player, ACCT.BUILDING, cost, "Shop improvement (capital)");
  player.capacityBonus = (player.capacityBonus ?? 0) + capacity;
  return `${player.name} invested ${w(cost)} in shop improvements — +${capacity} capacity, capitalised (not an expense)`;
}

/**
 * Relocate to a different building. Costs the WHOLE turn: this ends the player's action
 * phase (overhead was already paid at upkeep; in later stages no jobs progress this turn).
 * The caller is responsible for ending the turn — relocate sets a flag the turn loop reads.
 */
export function relocate(state, player, buildingId) {
  const target = findBuilding(state.economy, buildingId);
  if (!target) throw new GameError(`No building "${buildingId}"`);
  if (target.id === player.building) throw new GameError(`${player.name} is already in the ${target.name}`);
  if (player.tradesmen.length > target.capacity) {
    throw new GameError(`${target.name} caps at ${target.capacity}; ${player.name} has ${player.tradesmen.length} tradespeople — fire some first`);
  }
  // Leasehold improvements don't move with you — write off their book value as a loss.
  const bookValue = balances(player)[ACCT.BUILDING] || 0;
  if (bookValue > 0.001) {
    post(state, player, "Leasehold improvements written off (relocated)", [
      { acct: ACCT.REPAIRS, amt: bookValue },
      { acct: ACCT.BUILDING, amt: -bookValue },
    ]);
  }
  player.capacityBonus = 0;
  const from = findBuilding(state.economy, player.building);
  player.building = target.id;
  player.relocatedThisTurn = true;
  return `${player.name} relocated from the ${from.name} to the ${target.name} — that takes the whole turn`;
}
