// Persistent modifiers (WORLD.md) — the "world card" machinery. Slice 3 builds the engine with two
// bought business services and the Favor verb:
//   • insurance  — premium each turn (overhead); turns a shock/loss into a deductible.
//   • marketing  — premium each turn; injects extra work (a job card) into your draws.
//   • favor      — a one-off that nudges a modifier's clock (cancel/shorten a good one).
// Premiums post as real overhead, so "buying services" shows up on the P&L. A modifier with a
// `turnsLeft` timer expires; one with `turnsLeft: null` stands until cancelled.

import { GameError, w } from "./economy.js";
import { post, cashOut, balances, ACCT } from "../state/ledger.js";

/** Buyable persistent services. `premium` is charged each upkeep (overhead account). */
export const SERVICES = {
  insurance: { name: "Insurance policy", account: ACCT.INSURANCE, premium: 1, deductible: 0.5, positive: true },
  marketing: { name: "Marketing campaign", account: ACCT.MARKETING, premium: 2, inject: "referral_job", duration: 3, positive: true },
  accountant: { name: "Accountant on retainer", account: ACCT.PROF_FEES, premium: 1, positive: true },
  training: { name: "Training program", account: ACCT.TRAINING, premium: 1, speed: 1, positive: true },
};

export function hasModifier(player, kind) {
  return (player.modifiers ?? []).some((m) => m.kind === kind);
}

/** Sign up for a standing service (the first premium falls at the next upkeep). */
export function buyService(state, player, kind) {
  const def = SERVICES[kind];
  if (!def) throw new GameError(`No such service "${kind}"`);
  if (hasModifier(player, kind)) throw new GameError(`${player.name} already carries ${def.name}`);
  player.modifiers.push({ id: kind, kind, name: def.name, scope: "self", positive: def.positive, turnsLeft: def.duration ?? null });
  const span = def.duration ? ` for ${def.duration} turns` : "";
  return `${player.name} signed up for ${def.name} (${w(def.premium)}/turn)${span}`;
}

/** Upkeep: charge each modifier's premium, tick timers, drop expired ones. */
export function tickModifiers(state, player) {
  const lines = [];
  for (const m of player.modifiers ?? []) {
    const def = SERVICES[m.kind];
    if (def?.premium) {
      cashOut(state, player, def.account, def.premium, `${def.name} — premium`);
      lines.push(`${player.name}: ${def.name} premium ${w(def.premium)}`);
    }
    if (m.turnsLeft != null) m.turnsLeft -= 1;
  }
  player.modifiers = (player.modifiers ?? []).filter((m) => m.turnsLeft == null || m.turnsLeft > 0);
  return lines;
}

/** Insurance: split a loss into what the player bears (the deductible) vs what's covered. */
export function bearLoss(player, fullLoss) {
  const ins = (player.modifiers ?? []).find((m) => m.kind === "insurance");
  if (!ins) return { borne: fullLoss, covered: 0, insured: false };
  const borne = Math.ceil(fullLoss * SERVICES.insurance.deductible);
  return { borne, covered: fullLoss - borne, insured: true };
}

/** Accountant: a cleaner set of books factors receivables at a reduced fee. */
export function factoringFeeRate(player, base) {
  return hasModifier(player, "accountant") ? base / 2 : base;
}

/** Training: a trained crew burns work a little faster. */
export function trainingSpeedBonus(player) {
  return hasModifier(player, "training") ? SERVICES.training.speed : 0;
}

// --- Line of credit (financing — debt on the balance sheet, interest on the P&L) -----------

/** Draw cash on the line of credit: Dr cash / Cr line of credit (a liability). */
export function drawCredit(state, player, amount) {
  if (amount <= 0) throw new GameError("Nothing to draw");
  post(state, player, "Line of credit — draw", [
    { acct: ACCT.CASH, amt: amount },
    { acct: ACCT.LOC, amt: -amount },
  ]);
  return `${player.name} drew ${w(amount)} on the line of credit`;
}

/** Repay (some of) the line of credit: Dr line of credit / Cr cash. */
export function repayCredit(state, player, amount) {
  const owed = -(balances(player)[ACCT.LOC] || 0); // LOC carries a credit balance
  const pay = Math.min(amount, owed, player.cash);
  if (pay <= 0) throw new GameError(owed <= 0 ? "No line-of-credit balance to repay" : "No cash to repay with");
  post(state, player, "Line of credit — repayment", [
    { acct: ACCT.LOC, amt: pay },
    { acct: ACCT.CASH, amt: -pay },
  ]);
  return `${player.name} repaid ${w(pay)} on the line of credit`;
}

/** Year-end: force-settle the line of credit from cash so borrowed money can't win the game. */
export function forceSettleCredit(state, player) {
  const owed = -(balances(player)[ACCT.LOC] || 0);
  if (owed <= 0) return null;
  const pay = Math.min(owed, Math.max(0, player.cash));
  if (pay <= 0) return null;
  post(state, player, "Line of credit — settled at year-end", [
    { acct: ACCT.LOC, amt: pay },
    { acct: ACCT.CASH, amt: -pay },
  ]);
  return `${player.name} settles ${w(pay)} of debt as the books close`;
}

/** Upkeep: charge interest on any outstanding line-of-credit balance. */
export function chargeInterest(state, player, rate) {
  const owed = -(balances(player)[ACCT.LOC] || 0);
  if (owed <= 0) return [];
  const interest = Math.ceil(owed * rate);
  if (interest <= 0) return [];
  cashOut(state, player, ACCT.PROF_FEES, interest, "Line of credit — interest");
  return [`${player.name}: ${w(interest)} interest on ${w(owed)} of debt`];
}

/** The job card a marketing campaign injects into a player's draws each turn (or null). */
export function marketingInjection(player) {
  if (!hasModifier(player, "marketing")) return null;
  return {
    type: "job", id: "referral_job", name: "Referral job", value: 8, work_amount: 4, deadline: 3, terms: 1,
    min_tradesmen: 1, max_tradesmen: 1, required_equipment: null, droppable: true,
    flavor: "Your ad in the Gazette pays off — a call comes in.",
  };
}

/**
 * Favor: call in a political favor. Two uses:
 *   • on your OWN code violation — the Mayor gets the building inspector off your back: the defect
 *     is waived outright (no more fine, no repair bill).
 *   • on a rival's standing card — cut a GOOD one short (cancel a standing one, or knock a turn off
 *     a timed one) or prolong a BAD one (+1 turn of red tape).
 * Scarce and counterable.
 */
export function favorModifier(state, target, refId) {
  // Clear one of the target's own code violations — the inspector looks the other way.
  const di = (target.defects ?? []).findIndex((d) => d.id === refId);
  if (di >= 0) {
    const [d] = target.defects.splice(di, 1);
    return `🪙 a favor with the inspector — ${d.name} is waived (no fine, no repair)`;
  }
  const m = (target.modifiers ?? []).find((x) => x.id === refId);
  if (!m) throw new GameError(`No standing card or violation "${refId}" on ${target.name} to favor`);
  if (m.positive) {
    if (m.turnsLeft == null) {
      target.modifiers = target.modifiers.filter((x) => x.id !== refId);
      return `🪙 a favor is called in — ${target.name}'s ${m.name} is cancelled`;
    }
    m.turnsLeft -= 1;
    return `🪙 a favor cuts ${target.name}'s ${m.name} short — ${m.turnsLeft} turn(s) left`;
  }
  m.turnsLeft = (m.turnsLeft ?? 1) + 1; // prolong the misery
  return `🪙 a favor drags out ${target.name}'s ${m.name} — ${m.turnsLeft} turn(s) to go`;
}
