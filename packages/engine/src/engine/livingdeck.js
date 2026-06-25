// The living deck — mini-game outcomes inject or remove cards from a player's deck (or everyone's),
// each followed by a reshuffle (JOB-CARDS-PLAN). Dot's good word adds jobs; Hettrick & Lundgren pull
// them; the Mayor seeds favors; firing breeds union + poach cards; etc. Every reshape logs a line and
// queues a `deckEvent` so the UI can show the cards moving and play the shuffle.

/** A word-of-mouth trigger fires on a d6 ≤ the difficulty tier's threshold for that NPC (Stage 8).
 *  Steady → Dot 6 (always helps) / Hettrick 2 (rarely bites); Cutthroat reverses it. Unconfigured
 *  → always fires (back-compat with single-player tests that don't set a tier). */
export function womFires(state, npc) {
  const tiers = state.economy?.difficulty_tiers ?? {};
  const tier = tiers[state.difficulty ?? state.economy?.difficulty ?? "standard"] ?? {};
  const thr = tier[npc];
  if (thr == null) return true;
  return state.die() <= thr;
}

/** Fresh copies of a card def from the master pool, by id. */
function poolCopies(state, id, n) {
  const def = (state.cardPool ?? []).find((c) => c.id === id);
  if (!def) return [];
  return Array.from({ length: n }, () => ({ ...def }));
}

function queueEvent(state, ev) {
  (state.deckEvents = state.deckEvents ?? []).push(ev);
  return ev;
}

/** Inject n copies of card `id` into one player's deck + reshuffle. Returns the deckEvent or null. */
export function injectById(state, player, id, n, reason) {
  if (!player.deck || n <= 0) return null;
  const cards = poolCopies(state, id, n);
  if (!cards.length) return null;
  player.deck.inject(cards);
  state.log.push(`🔀 ${player.name}'s deck: +${cards.length} ${id} — ${reason} (reshuffled)`);
  return queueEvent(state, { who: player.id, add: id, count: cards.length, reason });
}

/** Inject n copies of card `id` into EVERY solvent player's deck (e.g. a union drive). */
export function injectAllById(state, id, n, reason) {
  const evs = [];
  for (const p of state.players) if (!p.bankrupt) { const ev = injectById(state, p, id, n, reason); if (ev) evs.push(ev); }
  return evs;
}

/** Pull up to n cards matching `pred` out of one player's deck + reshuffle. Returns count removed. */
export function removeMatching(state, player, pred, n, reason) {
  if (!player.deck) return 0;
  const removed = player.deck.remove(pred, n);
  if (removed > 0) {
    state.log.push(`🔀 ${player.name}'s deck: −${removed} card(s) — ${reason} (reshuffled)`);
    queueEvent(state, { who: player.id, remove: removed, reason });
  }
  return removed;
}

/** Convenience: pull up to n plain job cards (the bad-word-of-mouth effect for Hettrick/Lundgren). */
export function pullJobs(state, player, n, reason) {
  return removeMatching(state, player, (c) => c.type === "job" && !c.subcontract && !c.political, n, reason);
}
