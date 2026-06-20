// d6 rolls, seeded so litigation outcomes are deterministic in tests and replays. The game
// state carries its own die (built from the seeded rng in createGame); resolvers take the die
// as an argument so they stay pure and easy to test.

/** Build a d6 from a 0..1 rng (see deck.js makeRng). Returns 1..6. */
export function makeDie(rng) {
  return () => Math.floor(rng() * 6) + 1;
}
