// Expansion projects — growth as a deferred CAPITAL PROJECT, not an instant button.
//
//   start  → pay insurance (expense) + a 50% deposit (capitalised as a prepaid/CIP asset). Six
//            trade contracts go out to the town (one per trade; the landlord pays each, so YOUR
//            growth puts the whole table to work). You keep operating your OLD shop at its low rent.
//   tick   → next round (readyTurn) at upkeep: pay the balance, the fee CAPITALISES to the building
//            (a leasehold asset), and you move in (relocate) or gain capacity (improve). Can't cover
//            the balance → forfeit the deposit as a loss and stay put.
//
// Reuses what we already have: the six contracts are ordinary NPC jobs (like incident tenders); the
// money flows post through the ledger; the move-in is the existing relocate, just deferred.

import { GameError, findBuilding, w } from "./economy.js";
import { createJob } from "../state/state.js";
import { post, cashOut, balances, ACCT } from "../state/ledger.js";

function specFor(economy, target) {
  const spec = economy.expansion?.[target];
  if (!spec) throw new GameError(`No expansion target "${target}"`);
  return spec;
}

/** Begin readying a move (a bigger building) or an in-place capacity expansion ("improve"). */
export function startExpansion(state, player, target) {
  const economy = state.economy;
  const ex = economy.expansion;
  if (player.pendingExpansion) throw new GameError(`${player.name} is already readying ${player.pendingExpansion.targetName}`);

  const isImprove = target === "improve";
  let targetName;
  if (isImprove) {
    targetName = "the shop expansion";
  } else {
    const dest = findBuilding(economy, target);
    if (!dest) throw new GameError(`No building "${target}"`);
    if (dest.id === player.building) throw new GameError(`${player.name} is already in the ${dest.name}`);
    const here = findBuilding(economy, player.building);
    if ((dest.tier ?? 1) <= (here.tier ?? 1)) throw new GameError(`The ${dest.name} isn't a step up from the ${here.name}`);
    targetName = `the ${dest.name}`;
  }

  const spec = specFor(economy, target);
  const deposit = Math.round(spec.fee * (ex.deposit_fraction ?? 0.5));
  const upfront = deposit + ex.insurance;
  if (player.cash < upfront) {
    throw new GameError(`${player.name} needs ${w(upfront)} up front (deposit ${w(deposit)} + insurance ${w(ex.insurance)}) to ready ${targetName} — has ${w(player.cash)}`);
  }

  cashOut(state, player, ACCT.PREPAID, deposit, `Readying deposit — ${targetName}`); // capitalised, at-risk
  cashOut(state, player, ACCT.INSURANCE, ex.insurance, `Readying insurance — ${targetName}`); // expensed
  const tenders = spawnContracts(state, player, targetName, spec.contract_value, ex.contract_work, ex.contract_deadline);

  player.pendingExpansion = {
    target, isImprove, targetName, fee: spec.fee, deposit, balance: spec.fee - deposit,
    capacity: spec.capacity ?? 0, readyTurn: state.turn + 1,
  };
  return `🏗️ ${player.name} starts readying ${targetName}: ${w(deposit)} deposit + ${w(ex.insurance)} insurance down, ${tenders} trade contract(s) (${w(spec.contract_value)} each) out to the town — you pay ${targetName}'s higher rent NOW until move-in, so a stalling contractor costs you (sue them)`;
}

/** One NPC contract per trade, to the player who runs it (the mover takes their own trade's). */
function spawnContracts(state, mover, targetName, value, work, deadline) {
  let n = 0;
  for (const trade of state.economy.services) {
    const taker = mover.service === trade ? mover : state.players.find((p) => p !== mover && !p.bankrupt && p.service === trade);
    if (!taker) continue; // no one runs this trade → the contract lapses (the insurance covers it)
    const job = createJob(
      { id: `ready_${trade}`, name: `Ready ${targetName} — ${trade} fit-out`, value, work_amount: work, deadline, terms: 1, min_tradesmen: 1, max_tradesmen: 1, required_equipment: null, droppable: true },
      state.turn,
    );
    job.readying = true;
    if (taker !== mover) job.readying_for = mover.id; // a rival's fit-out you depend on → suable if they stall
    taker.jobs.push(job);
    n++;
  }
  return n;
}

/** A fit-out contract fell through (yours OR a rival's you depend on) → the building can't be readied,
 *  so the move COLLAPSES (flagged here, forfeited at the mover's next upkeep). If a RIVAL stalled a
 *  contract you depend on, you may also sue them for the value (recovered, capped). */
export function onReadyingBotch(state, contractor, job) {
  const moverId = job.readying_for ?? contractor.id; // a rival's fit-out (readying_for) or your own
  const mover = state.players.find((p) => p.id === moverId);
  if (!mover || !mover.pendingExpansion) return null;
  mover.pendingExpansion.fitOutFailed = true; // the move can't complete — a contract didn't deliver
  if (job.readying_for && contractor.id !== mover.id && !contractor.bankrupt && !mover.bankrupt) {
    state.pendingDamages.push({ hirerId: mover.id, contractorId: contractor.id, jobId: job.id, jobName: job.name, value: job.value, recipientId: mover.id });
    return `⚠ ${mover.name}'s move stalls — ${contractor.name} botched the ${job.name}; may sue for ${w(job.value)} in damages`;
  }
  return `⚠ ${mover.name}'s ${job.name} fit-out fell through — the move will collapse`;
}

/** Upkeep hook: once readied, pay the balance + capitalise + move in, or forfeit the deposit. */
export function tickExpansion(state, player) {
  const pe = player.pendingExpansion;
  if (!pe) return [];
  // A fit-out contract fell through → the building never got readied. The move collapses: forfeit the
  // deposit and stay put (you'd have sued any rival who stalled). You DON'T get the new building.
  if (pe.fitOutFailed) {
    post(state, player, `Forfeited the ${pe.targetName} readying deposit (fit-out collapsed)`, [
      { acct: ACCT.REPAIRS, amt: pe.deposit }, { acct: ACCT.PREPAID, amt: -pe.deposit },
    ]);
    player.pendingExpansion = null;
    return [`⚠ ${player.name}'s move to ${pe.targetName} collapsed — a fit-out contract fell through; forfeited the ${w(pe.deposit)} deposit, stays put`];
  }
  // The move-in is GATED on the fit-out finishing: every readying contract (yours + any rival's you
  // depend on) must clear before you can move. Until then you're already paying the new building's
  // higher rent (overheadFor) on a shop you can't use — so dragging the fit-out, or a stalling rival,
  // genuinely costs you. A contract leaves this count when it's delivered OR it expires (you'd have
  // sued the staller via onReadyingBotch). Floor of readyTurn so even an instant fit-out takes a turn.
  const outstanding = state.players.reduce(
    (n, p) => n + p.jobs.filter((j) => j.readying && (p.id === player.id || j.readying_for === player.id) && j.state !== "Complete").length,
    0,
  );
  if (state.turn < pe.readyTurn || outstanding > 0) {
    return outstanding > 0
      ? [`🏗️ ${player.name}'s ${pe.targetName} fit-out is still underway — ${outstanding} contract(s) outstanding; paying the higher rent until it's done`]
      : [];
  }

  if (player.cash < pe.balance) {
    // Can't close it out → forfeit the deposit (a real loss) and stay put.
    post(state, player, `Forfeited the ${pe.targetName} readying deposit`, [
      { acct: ACCT.REPAIRS, amt: pe.deposit }, { acct: ACCT.PREPAID, amt: -pe.deposit },
    ]);
    player.pendingExpansion = null;
    return [`⚠ ${player.name} couldn't cover the ${w(pe.balance)} balance on ${pe.targetName} — forfeited the ${w(pe.deposit)} deposit, stays put`];
  }

  const lines = [];
  if (pe.isImprove) {
    player.capacityBonus = (player.capacityBonus ?? 0) + pe.capacity;
    lines.push(`🏗️ ${player.name}'s shop expansion is finished — +${pe.capacity} crew capacity`);
  } else {
    // Leasehold on the OLD building doesn't move with you — write off its book value as a loss.
    const old = balances(player)[ACCT.BUILDING] || 0;
    if (old > 0.001) {
      post(state, player, "Leasehold written off (relocated)", [{ acct: ACCT.REPAIRS, amt: old }, { acct: ACCT.BUILDING, amt: -old }]);
    }
    player.capacityBonus = 0;
    const from = findBuilding(state.economy, player.building);
    player.building = pe.target;
    lines.push(`🏗️ ${player.name} moved into ${pe.targetName} (from the ${from.name}) — bigger crew, higher rent`);
  }
  // Capitalise the whole fee as a leasehold asset: Dr building / Cr the deposit (prepaid) + the balance (cash).
  post(state, player, `Capitalise ${pe.targetName} readying`, [
    { acct: ACCT.BUILDING, amt: pe.fee },
    { acct: ACCT.PREPAID, amt: -pe.deposit },
    { acct: ACCT.CASH, amt: -pe.balance },
  ]);
  player.pendingExpansion = null;
  return lines;
}
