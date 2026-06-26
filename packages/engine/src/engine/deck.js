// A draw pile. Stage 2 keeps it simple: shuffle the job cards, draw from the top, reshuffle
// the full set when exhausted. Stage 3 replaces this with the fixed feast/famine composition
// drawn WITHOUT reshuffle until empty (so a run of shocks becomes a real "season"). The draw
// interface (peek count, draw N) stays the same, so that swap won't touch callers.

/** Deterministic PRNG (mulberry32) so tests and replays can fix a seed. */
export function makeRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Deck {
  constructor(cards, rng = makeRng()) {
    this.source = [...cards];
    this.rng = rng;
    this.pile = [];
    this.reshuffle();
  }

  reshuffle() {
    this.pile = [...this.source];
    // Fisher–Yates with the injected rng.
    for (let i = this.pile.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [this.pile[i], this.pile[j]] = [this.pile[j], this.pile[i]];
    }
  }

  /** Draw one card, reshuffling if the pile has run dry. Returns null only if no source. */
  draw() {
    if (this.source.length === 0) return null;
    if (this.pile.length === 0) this.reshuffle();
    return this.pile.pop();
  }

  /** Draw up to n cards. */
  drawN(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = this.draw();
      if (c) out.push(c);
    }
    return out;
  }

  /** Slip a card into a RANDOM spot in the current pile without disturbing the order of the rest —
   *  so a living-deck change doesn't reshuffle (and thereby reset) the feast/famine draw sequence. */
  #slipIn(card) {
    const i = Math.floor(this.rng() * (this.pile.length + 1));
    this.pile.splice(i, 0, card);
  }

  /** Living deck: add cards to the composition (Dot's word, Mayor favors, union…). They join the
   *  source (so future reshuffles include them) AND get sprinkled into the remaining pile so they're
   *  drawable now — WITHOUT reshuffling, so the existing draw-down/order survives. */
  inject(cards) {
    this.source.push(...cards);
    for (const c of cards) this.#slipIn(c);
  }

  /** Put already-drawn cards back into the draw PILE only (NOT source) — e.g. an out-of-season card
   *  benched until its season. Slipped in at random, preserving the rest of the order. */
  returnToPile(cards) {
    for (const c of cards) this.#slipIn(c);
  }

  /** Living deck: pull up to n cards matching pred out of the composition AND the current pile (no
   *  reshuffle — the remaining order is kept). Returns the count removed from the source. */
  remove(pred, n = Infinity) {
    let removed = 0;
    this.source = this.source.filter((c) => {
      if (removed < n && pred(c)) { removed++; return false; }
      return true;
    });
    let p = 0;
    this.pile = this.pile.filter((c) => {
      if (p < removed && pred(c)) { p++; return false; }
      return true;
    });
    return removed;
  }
}
