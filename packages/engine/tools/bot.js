// Heuristic auto-players for the tuning harness (Stage 5). NOT part of the game — the real
// game has humans decide — but they play plausibly enough to exercise the economy across
// hundreds of games. They never play Sabotage/Sue (so no response windows open during
// simulation); they focus on the core loop: take jobs, staff them, keep the lights on.
//
// Three strategies let the harness measure different questions:
//   "balanced"  — do the dominant thing; used for the survivability runs.
//   "equipment" — specialist: buy & stack tools, stay lean on staff (leans into per_equipment).
//   "labor"     — labor shop: hire to the building cap, buy gear only when a job gates on it.
// Running equipment vs labor head-to-head shows whether the count-scaling cards even the
// incentives (Dial 3) — something the blended bot can't reveal.

import { findEquipment, findBuilding } from "../src/engine/economy.js";

const hasEquip = (p, defId) => defId == null || p.equipment.some((e) => e.defId === defId);

function overheadGuess(state, p) {
  const rent = findBuilding(state.economy, p.building).rent;
  const eqFees = p.equipment.filter((e) => !e.owned).reduce((s, e) => s + findEquipment(state.economy, e.defId).rent_per_turn, 0);
  return rent + p.tradesmen.length * state.economy.wage_per_turn + eqFees;
}

const tryDo = (fn) => { try { fn(); return true; } catch { return false; } };

export function botActions(game, strategy = "balanced") {
  const state = game.state;
  const p = game.currentPlayer;
  const over = () => overheadGuess(state, p);
  const cap = findBuilding(state.economy, p.building).capacity;
  const waiting = () => p.jobs.filter((j) => ["Queued", "OnHold"].includes(j.state)).length;

  // 1. Pay any due NPC payable if we can and still cover overhead (avoid court).
  for (const ap of [...p.payables]) {
    if (ap.is_npc && state.turn >= ap.due_turn && p.cash >= ap.amount + over()) tryDo(() => game.payPayable(ap.id));
  }

  // 2. The opening fork (turn 1, lone tradesperson). With equipment now gating half the jobs,
  //    tooling up first is the sensible default; only the pure labor shop opens by hiring.
  if (state.turn === 1 && p.tradesmen.length === 1 && p.equipment.length === 0) {
    if (strategy === "labor" || strategy === "hire") tryDo(() => game.hire());
    else tryDo(() => game.buyEquipment("basic"));
  }

  // 2b. Relocate up a tier when there's a clear reason and the cash to absorb the lost turn:
  //     we're staff-capped with a backlog (labor), or a high-value job needs a bigger shop.
  if (strategy !== "equipment" || p.tradesmen.length > 1) {
    const tiers = [...state.economy.buildings].sort((a, b) => a.tier - b.tier);
    const here = findBuilding(state.economy, p.building);
    const next = tiers.find((b) => b.tier === (here.tier ?? 1) + 1);
    const wantBiggerForJob = p.jobs.some((j) => ["Queued", "OnHold"].includes(j.state) && j.required_building_tier > (here.tier ?? 1) && j.value >= 15);
    const cappedWithBacklog = p.tradesmen.length >= here.capacity && waiting() >= 2 && strategy !== "equipment";
    if (next && p.cash > over() * 8 && (wantBiggerForJob || cappedWithBacklog)) {
      if (tryDo(() => game.relocate(next.id))) return; // relocating ends the turn
    }
  }

  // 3. Buy/rent equipment a high-value queued job is gated on, if affordable.
  const gated = p.jobs
    .filter((j) => ["Queued", "OnHold"].includes(j.state) && j.required_equipment && !hasEquip(p, j.required_equipment))
    .sort((a, b) => b.value - a.value);
  for (const j of gated) {
    const def = findEquipment(state.economy, j.required_equipment);
    if (p.cash >= def.buy_cost + over()) tryDo(() => game.buyEquipment(def.id));
    else tryDo(() => game.rentEquipment(def.id));
  }

  // 3b. The specialist stacks tools beyond what jobs gate (≈ one per crew + 1) to lean into
  //     the per_equipment bonuses.
  if (strategy === "equipment" && p.cash > over() * 5 && p.equipment.length < p.tradesmen.length + 1) {
    tryDo(() => game.buyEquipment("basic"));
  }

  // 4. Assign idle tradespeople to the best workable jobs (value first, then urgency).
  const workable = () => p.jobs
    .filter((j) => ["Queued", "OnHold", "Active"].includes(j.state) && hasEquip(p, j.required_equipment) && j.assigned_tradesmen.length < j.max_tradesmen)
    .sort((a, b) => b.value - a.value || a.deadline_turn - b.deadline_turn);
  for (let t = p.tradesmen.filter((x) => !x.assignedJob).length; t > 0; t--) {
    const job = workable()[0];
    if (!job) break;
    if (!tryDo(() => game.assignJob(job.id))) break;
  }

  // 5. Hire — labor shop hires aggressively to the cap; specialist stays lean (≤2); balanced
  //    hires only with a sustained surplus and a backlog.
  const hireThreshold = strategy === "equipment" ? Infinity : strategy === "balanced" ? over() * 6 : over() * 3;
  const maxStaff = strategy === "equipment" ? 2 : cap;
  const needBacklog = strategy === "labor" ? 1 : 2;
  if (p.cash > hireThreshold && p.tradesmen.length < maxStaff && waiting() >= needBacklog) tryDo(() => game.hire());

  // 6. If cash is tight, factor the oldest invoice to stay solvent.
  if (p.cash < over() && p.invoices.length) tryDo(() => game.factorInvoice(p.invoices[0].id));
}
