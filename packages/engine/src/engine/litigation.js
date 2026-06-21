// The civil resolution math — pure functions over the economy + a die. All state mutation
// (wiping AP, paying fees) lives in game.js / payables.js; this module just decides the walk
// threshold and whether a roll escapes, so it's trivial to test with a fixed die.
//
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
