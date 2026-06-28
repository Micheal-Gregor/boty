// Heuristic auto-players for the tuning harness (Stage 5) AND the web's rival seats. They play
// plausibly enough to exercise the economy across hundreds of games AND to feel like real
// businesses at the table: take jobs, staff them, keep the lights on — and also stock standing
// services at the BBB fair, call in Favors, and lean on the front-runner with Sabotage/Sue.
//
// Response-window safety: a bot only opens a Sabotage/Sue window against ANOTHER BOT, and resolves
// it on the spot with the target's rational reply — so nothing leaks past the turn in the headless
// harness, and the web never silently overrides a HUMAN's defense. The caller passes `humanIds`
// (the seats that are human); in the harness that set is empty (everyone's a bot).
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

export function botActions(game, strategy = "balanced", opts = {}) {
  const state = game.state;
  const p = game.currentPlayer;
  const humanIds = opts.humanIds ?? new Set(); // seats a bot must not open a response window against
  const over = () => overheadGuess(state, p);
  const cap = findBuilding(state.economy, p.building).capacity;
  const waiting = () => p.jobs.filter((j) => ["Queued", "OnHold"].includes(j.state)).length;
  const byId = (id) => state.players.find((x) => x.id === id);
  const hand = (pl, type) => pl.hand.some((c) => c.type === type);
  const has = (k) => (p.modifiers ?? []).some((m) => m.kind === k);
  const richestRival = (excludeHumans = false) =>
    state.players
      .filter((x) => x !== p && !x.bankrupt && (!excludeHumans || !humanIds.has(x.id)))
      .sort((a, b) => b.cash - a.cash)[0] ?? null;
  // Resolve a window we just opened against another bot, with the target's rational reply.
  const settleBotThreat = () => {
    const t = state.pendingThreat;
    if (!t) return;
    if (t.type === "sabotage") {
      const owner = byId(t.ownerId);
      tryDo(() => game.respondToThreat({ counter: owner ? hand(owner, "rush") : false }));
    } else {
      const tgt = byId(t.debtorId ?? t.contractorId);
      const canFight = tgt && tgt.cash >= state.economy.civil.legal_fee;
      tryDo(() => game.respondToThreat({ contest: !!canFight, ownLawyer: tgt ? hand(tgt, "slick_lawyer") : false }));
    }
  };

  // 1. Pay any DUE bill we can while still covering overhead — NPC vendors (avoid court) and
  //    delivered player contracts alike (an honest debtor pays the trades; floating only invites
  //    a collections agency). Pending contracts (job still in progress) aren't due yet.
  for (const ap of [...p.payables]) {
    if (opts.dodge && !ap.is_npc) continue; // a dodge-GC stiffs its subs (still pays NPC bills to avoid NPC court) — for the balance gate
    if (!ap.pending && state.turn >= ap.due_turn && p.cash >= ap.amount + over()) tryDo(() => game.payPayable(ap.id));
  }

  // 1b. Call in a Favor: first to waive our own worst code violation (free — no fine, no repair);
  //     otherwise to cancel the front-runner's strongest standing perk (gang up on the leader).
  if (hand(p, "favor")) {
    const worst = [...p.defects].sort((a, b) => (b.fine ?? 0) - (a.fine ?? 0))[0];
    if (worst) tryDo(() => game.playFavor(p.id, worst.id));
    else {
      const leader = richestRival();
      const perk = leader?.modifiers?.find((m) => m.positive);
      if (perk && leader.cash > p.cash) tryDo(() => game.playFavor(leader.id, perk.id));
    }
  }

  // 1c. Clear code violations while solvent — the fine + output drag usually outweighs the
  //     deferred repair bill, and a lingering defect quietly strangles throughput.
  for (const d of [...p.defects]) {
    if (p.cash > over()) tryDo(() => game.fixDefect(d.id));
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
    // Expansion is a multi-round cash commitment (deposit now, balance next round) — only take it
    // from a fat cushion so a follow-up shock doesn't fold us mid-move.
    if (next && !p.pendingExpansion && p.cash > over() * 15 && (wantBiggerForJob || cappedWithBacklog)) {
      tryDo(() => game.startExpansion(next.id));
    }
  }

  // 2c. BBB vendor fair in town this turn — invest in a standing service when there's a real
  //     surplus (premiums are overhead, so take at most one and keep a cushion), and add shop
  //     capacity when a labor shop is capped with a backlog.
  if (p.bbbThisTurn) {
    const here = findBuilding(state.economy, p.building);
    if (strategy !== "equipment" && !p.pendingExpansion && p.tradesmen.length >= here.capacity && waiting() >= 2 && p.cash > over() * 12) {
      tryDo(() => game.startExpansion("improve"));
    }
    const idle = p.tradesmen.filter((t) => !t.assignedJob).length;
    const pick =
      !has("insurance") && p.equipment.length && p.cash > over() * 6 ? "insurance"
      : !has("training") && p.tradesmen.length >= 2 && p.cash > over() * 6 ? "training"
      : !has("accountant") && p.payables.length >= 2 && p.cash > over() * 6 ? "accountant"
      : !has("marketing") && idle >= 1 && p.cash > over() * 6 ? "marketing"
      : null;
    if (pick) tryDo(() => game.buyService(pick));
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

  // 4. Assign idle tradespeople to the best workable jobs. Phases of a big project come FIRST (a
  //    collapse costs everyone), then value, then urgency.
  const workable = () => p.jobs
    .filter((j) => ["Queued", "OnHold", "Active"].includes(j.state) && hasEquip(p, j.required_equipment) && j.assigned_tradesmen.length < j.max_tradesmen)
    .sort((a, b) => (b.project_id ? 1 : 0) - (a.project_id ? 1 : 0) || b.value - a.value || a.deadline_turn - b.deadline_turn);
  for (let t = p.tradesmen.filter((x) => !x.assignedJob).length; t > 0; t--) {
    const job = workable()[0];
    if (!job) break;
    if (!tryDo(() => game.assignJob(job.id))) break;
  }

  // 4b. Cut losses: sell a job that's about to expire and we have no way to start (too big a
  //     shop/crew, or every hand is busy) — a little cash beats watching it rot.
  const here2 = findBuilding(state.economy, p.building);
  const noHands = p.tradesmen.every((t) => t.assignedJob);
  for (const j of [...p.jobs]) {
    if (j.hirer_id || !["Queued", "OnHold"].includes(j.state)) continue;
    const cantStart = j.required_building_tier > (here2.tier ?? 1) || j.min_tradesmen > here2.capacity || noHands;
    if (j.deadline_turn - state.turn <= 2 && cantStart) tryDo(() => game.sellJob(j.id));
  }

  // 5. Hire — labor shop hires aggressively to the cap; specialist stays lean (≤2); balanced
  //    hires only with a sustained surplus and a backlog.
  const hireThreshold = strategy === "equipment" ? Infinity : strategy === "balanced" ? over() * 6 : over() * 3;
  const maxStaff = strategy === "equipment" ? 2 : cap;
  const needBacklog = strategy === "labor" ? 1 : 2;
  if (p.cash > hireThreshold && p.tradesmen.length < maxStaff && waiting() >= needBacklog) tryDo(() => game.hire());

  // 6. Bridge a cash crunch with the AR book: factor an own-job invoice first; if still short,
  //    sell a rival's debt to collections (cash now, and the agency hounds them with a lawyer).
  if (p.cash < over() && p.invoices.length) tryDo(() => game.factorInvoice(p.invoices[0].id));
  if (p.cash < over()) {
    for (const o of state.players) {
      const claim = o.payables.find((a) => a.creditor_id === p.id && !a.pending && state.turn >= a.due_turn);
      if (claim && tryDo(() => game.factorClaim(claim.id))) break;
    }
  }

  // 7. Last resort: a bill is due we still can't cover and there's nothing left to factor — tap the
  //    bank to stay solvent (a liability, force-settled at year-end).
  const stuck = p.payables.some((a) => !a.pending && state.turn >= a.due_turn && p.cash < a.amount);
  if (stuck && p.cash < over() && !p.invoices.length) tryDo(() => game.drawCredit());

  // 8. Hobble the front-runner: holding a Sabotage and a RICHER bot rival is out front → pull in
  //    their best job's deadline. Never aimed at a human seat (that needs their live response).
  if (hand(p, "sabotage")) {
    const mark = richestRival(true);
    if (mark && mark.cash > p.cash) {
      const job = [...mark.jobs]
        .filter((j) => ["Queued", "OnHold", "Active"].includes(j.state))
        .sort((a, b) => b.value - a.value)[0];
      if (job && tryDo(() => game.playSabotage(job.id))) settleBotThreat();
    }
  }

  // 9. Collect hard: sue a BOT rival who's dodging a delivered, still-suable debt they owe us.
  for (const o of state.players) {
    if (o === p || o.bankrupt || humanIds.has(o.id)) continue;
    const debt = o.payables.find(
      (a) => a.creditor_id === p.id && !a.is_npc && !a.pending && a.sue_window_remaining > 0 && state.turn >= a.due_turn && (a.turns_dodged ?? 0) >= 1,
    );
    if (debt && tryDo(() => game.sue(o.id, debt.id))) { settleBotThreat(); break; }
  }
}
