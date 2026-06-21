// The civil resolution math (Dials 5 & 6) — pure functions over the economy + a die. All the
// state mutation (deposits, pots, wiping AP, reimbursing fees) lives in game.js; this module
// only decides targets and whether a roll wins, so it is trivial to test with a fixed die.
//
// Both NPC disputes and player suits run through the SAME civil resolver — disputes go to
// court; the table litigates constantly.

/**
 * Compute the defendant's win target (they win on roll >= target). Starts at base_target and
 * shifts by the active modifiers. Returns the raw number; > 6 means the defence is hopeless.
 * @param mods { slick?:bool, late?:bool, ownLawyer?:bool, court?:bool }
 */
export function civilTarget(economy, mods = {}) {
  const c = economy.civil;
  let t = c.base_target;
  if (mods.slick) t += c.modifiers.slick_lawyer;
  if (mods.late) t += c.modifiers.late_or_botched;
  if (mods.ownLawyer) t += c.modifiers.own_lawyer;
  if (mods.court) t += c.court_penalty;
  return Math.max(1, t);
}

/** Probability text helper for the UI (e.g. "2+ ≈ 83%"). */
export function targetOdds(target) {
  const ways = Math.max(0, Math.min(6, 6 - target + 1));
  return `${target}+ ≈ ${Math.round((ways / 6) * 100)}%`;
}

/** Roll the civil action. The DEFENDANT wins on roll >= target. */
export function rollCivil(die, target) {
  const roll = die();
  return { roll, target, defendantWins: roll >= target };
}

// --- Civil resolver v2 (getaway model) ---------------------------------------------------
// The defendant "gets away" on roll ≤ threshold. ONE modifier: each Slick Lawyer shifts the
// threshold ±lawyer_shift toward the side that played it. Clamped so it's never a sure thing.

/** @param base economy.civil.getaway_owed (33%) or getaway_dispute (50%). */
export function getawayThreshold(economy, base, defenderLawyers = 0, accuserLawyers = 0) {
  const c = economy.civil;
  const g = base + c.lawyer_shift * (defenderLawyers - accuserLawyers);
  return Math.max(c.min_getaway, Math.min(c.max_getaway, g));
}

/** Roll the case. The defendant escapes on roll ≤ threshold. */
export function rollGetaway(die, threshold) {
  const roll = die();
  return { roll, threshold, getsAway: roll <= threshold };
}

/** Odds text helper, e.g. "1–2 ≈ 33%". */
export function getawayOdds(threshold) {
  return `1–${threshold} ≈ ${Math.round((threshold / 6) * 100)}%`;
}

// --- NPC Demand Roll (escalating press-your-luck) ----------------------------------------

/** The pass target for the Nth dodge: 1st→2+, 2nd→3+, 3rd→4+, 4th→5+. */
export function demandTarget(dodgeNum) {
  return 1 + dodgeNum;
}

/**
 * Roll a Demand Roll for a payable being dodged for the `dodgeNum`-th time. On the final
 * allowed dodge there is no pass (→court) except a natural 6, which forgives the debt.
 */
export function rollDemand(economy, die, dodgeNum) {
  const max = economy.npc_demand.max_dodges;
  const roll = die();
  const naturalSix = roll === 6;
  if (dodgeNum >= max) {
    // Last turn: only a natural 6 saves you (forgiven); otherwise it goes to court.
    return { roll, target: null, passed: false, naturalSix, forgiven: naturalSix };
  }
  const target = demandTarget(dodgeNum);
  return { roll, target, passed: roll >= target, naturalSix, forgiven: false };
}
