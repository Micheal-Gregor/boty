// Per-game deck builder. The Fortune file is the MASTER POOL (~87 cards). Each game we deal a
// UNIQUE 60-card deck from it: the mandatory SPINE (always present) plus a random fill from the
// rest. The leftover cards become the RESERVE — they're held out of the first pass and, on the rare
// reshuffle (a maxed 4-draw shop late in the year), become the second deck alongside a fresh spine,
// so every card eventually sees play and the second wind feels like new town events (Model 2).

// The SPINE — the cards every deck must contain (id → copies). The ladder is the only HARD
// requirement (it's how you earn); the rest keep the core loops alive: the NPC cast, the AR/AP +
// litigation drivers, the BBB fair (which gates shop upgrades, i.e. the 7-staff / 4th-card ceiling),
// and the maintenance hook. Feast/famine (windfalls/shocks) and civics come through the random fill,
// which is statistically dense in them. Tune freely.
export const SPINE = {
  // the tailored job ladder — your only way to earn
  j1: 3, j2: 3, j3: 2, j4: 2, j5: 1, j6: 1,
  // the word-of-mouth cast
  job_hettrick: 1, job_lundgren: 1, job_dot: 1, job_boon: 1,
  // the AR/AP + litigation drivers (the "main event")
  referral_1p: 1, referral_2p: 1, referral_3p: 1, poached: 1, reelection_drive: 1, courthouse_day: 1,
  // the BBB vendor fair — gates shop upgrades, hence the 7-staff / 4-card ceiling
  bbb_special: 2,
  // the maintenance hook
  code_violation: 1,
};

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deal a `size`-card deck from the master `pool`: the spine first, then a random fill. Returns
 * `{ deck, reserve }`. If the pool is already ≤ size (e.g. a small synthetic test deck), the whole
 * pool is the deck and the reserve is empty — the builder is a no-op there.
 *
 * `spine` is { id: copies }. Spine cards absent from the pool are simply skipped.
 */
export function buildGameDeck(pool, spine = SPINE, size = 60, rng = Math.random) {
  if (!Array.isArray(pool) || pool.length <= size) return { deck: [...(pool ?? [])], reserve: [], spine: [] };

  const byId = new Map();
  for (const c of pool) { if (!byId.has(c.id)) byId.set(c.id, []); byId.get(c.id).push(c); }

  const deck = [];
  const taken = new Set();
  const spineCards = [];
  // 1. the mandatory spine
  for (const [id, n] of Object.entries(spine)) {
    const avail = byId.get(id) ?? [];
    for (let k = 0; k < Math.min(n, avail.length); k++) { deck.push(avail[k]); taken.add(avail[k]); spineCards.push(avail[k]); }
  }
  // 2. random fill from the rest of the pool, up to `size`
  const rest = shuffleInPlace(pool.filter((c) => !taken.has(c)), rng);
  for (const c of rest) { if (deck.length >= size) break; deck.push(c); taken.add(c); }
  // 3. whatever's left is the reserve (the held-out cards)
  const reserve = pool.filter((c) => !taken.has(c));
  return { deck, reserve, spine: spineCards };
}
