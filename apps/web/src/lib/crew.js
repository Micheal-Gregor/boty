// Crew identities — every tradesperson gets a name and a one-line personality, derived from their
// worker id so it's stable all game (and pairs with their pooled portrait). Purely cosmetic; the
// engine never sees these. Edit the pools freely — 24 × 20 first/last = 480 names × 20 quips.

const FIRST = [
  "Hank", "Dale", "Marge", "Ruth", "Earl", "Cletus", "Vern", "Opal", "Gus", "Wanda",
  "Floyd", "Della", "Roy", "Hazel", "Otis", "Pearl", "Bud", "Edna", "Clyde", "Mabel",
  "Walt", "Iris", "Stan", "Lottie",
];
const LAST = [
  "Morrow", "Tubbs", "Kowalski", "Hutchins", "Pratt", "Stroud", "Dabney", "Fenwick",
  "Crabb", "Hollis", "Sennett", "Voss", "Buckner", "Pell", "Garrity", "Tillman",
  "Roper", "Mackey", "Dunlap", "Cobb",
];
const FLAVOR = [
  "Never misses a Monday.",
  "Great with customers, slow with paperwork.",
  "Swears the old ways are best.",
  "First in, last out.",
  "Keeps a tidy truck and a tidier ledger.",
  "Has opinions about everyone else's work.",
  "Whistles through the worst jobs.",
  "Cuts corners when the boss isn't looking.",
  "Knows everybody in the Hollow.",
  "Treats every job like it's their own house.",
  "Quick hands, quicker temper.",
  "Always angling for a raise.",
  "Reliable as the sunrise — dull as it, too.",
  "Brings donuts on Fridays.",
  "Reads the manual cover to cover.",
  "Learned the trade from their old man.",
  "Would rather redo it than leave it wrong.",
  "A little slow, but never sloppy.",
  "Talks a big game — mostly backs it up.",
  "Saving up to open their own shop someday.",
];

const hash = (s, salt) => {
  let h = salt >>> 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
};

/** Stable {name, flavor} for a worker id (e.g. "T5"). */
export function crewIdentity(id) {
  const s = String(id);
  return {
    name: `${FIRST[hash(s, 1) % FIRST.length]} ${LAST[hash(s, 7) % LAST.length]}`,
    flavor: FLAVOR[hash(s, 13) % FLAVOR.length],
  };
}
