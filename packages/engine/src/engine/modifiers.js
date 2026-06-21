// Persistent modifiers (WORLD.md) — the "world card" machinery. Slice 3 builds the engine with two
// bought business services and the Favor verb:
//   • insurance  — premium each turn (overhead); turns a shock/loss into a deductible.
//   • marketing  — premium each turn; injects extra work (a job card) into your draws.
//   • favor      — a one-off that nudges a modifier's clock (cancel/shorten a good one).
// Premiums post as real overhead, so "buying services" shows up on the P&L. A modifier with a
// `turnsLeft` timer expires; one with `turnsLeft: null` stands until cancelled.

import { GameError, w } from "./economy.js";
import { cashOut, ACCT } from "../state/ledger.js";

/** Buyable persistent services. `premium` is charged each upkeep (overhead account). */
export const SERVICES = {
  insurance: { name: "Insurance policy", account: ACCT.INSURANCE, premium: 1, deductible: 0.5, positive: true },
  marketing: { name: "Marketing campaign", account: ACCT.MARKETING, premium: 2, inject: "referral_job", positive: true },
};

export function hasModifier(player, kind) {
  return (player.modifiers ?? []).some((m) => m.kind === kind);
}

/** Sign up for a standing service (the first premium falls at the next upkeep). */
export function buyService(state, player, kind) {
  const def = SERVICES[kind];
  if (!def) throw new GameError(`No such service "${kind}"`);
  if (hasModifier(player, kind)) throw new GameError(`${player.name} already carries ${def.name}`);
  player.modifiers.push({ id: kind, kind, name: def.name, scope: "self", positive: def.positive, turnsLeft: null });
  return `${player.name} signed up for ${def.name} (${w(def.premium)}/turn)`;
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
 * Favor: nudge a target's modifier clock. Cut a GOOD thing (cancel a standing one, or knock a turn
 * off a timed one); prolong a BAD thing (+1 turn / a red-tape lag). Scarce and counterable.
 */
export function favorModifier(state, target, modId) {
  const m = (target.modifiers ?? []).find((x) => x.id === modId);
  if (!m) throw new GameError(`No modifier "${modId}" on ${target.name} to favor`);
  if (m.positive) {
    if (m.turnsLeft == null) {
      target.modifiers = target.modifiers.filter((x) => x.id !== modId);
      return `🪙 a favor is called in — ${target.name}'s ${m.name} is cancelled`;
    }
    m.turnsLeft -= 1;
    return `🪙 a favor cuts ${target.name}'s ${m.name} short — ${m.turnsLeft} turn(s) left`;
  }
  m.turnsLeft = (m.turnsLeft ?? 1) + 1; // prolong the misery
  return `🪙 a favor drags out ${target.name}'s ${m.name} — ${m.turnsLeft} turn(s) to go`;
}
