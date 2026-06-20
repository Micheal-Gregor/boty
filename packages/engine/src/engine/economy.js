// Content helpers — PURE and environment-agnostic (no filesystem, no Node built-ins), so the
// engine core runs unchanged in Node, the browser, and Deno. Filesystem loading lives in the
// Node-only sibling `content-fs.js`; browsers/Deno import the JSON directly and pass it in.

/** Thrown when a move is illegal (the engine refuses, the UI explains). */
export class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = "GameError";
  }
}

/** Validate a parsed economy object. Throws GameError on a malformed file. */
export function validateEconomy(e) {
  const required = ["starting_cash", "starting_building", "starting_tradesmen", "max_turns", "wage_per_turn", "sign_on_fee", "severance", "buildings", "equipment", "services"];
  for (const key of required) {
    if (e[key] === undefined) throw new GameError(`economy.json missing required key: ${key}`);
  }
  if (!findBuilding(e, e.starting_building)) {
    throw new GameError(`economy.json starting_building "${e.starting_building}" is not a defined building`);
  }
  return e;
}

/**
 * Expand a deck file's `cards` array: a card with `copies: 3` becomes three identical cards
 * (the `copies` field is stripped). This is how the fixed feast/famine composition is authored
 * compactly. Pure — takes the parsed `{ cards }` object, returns a flat array.
 */
export function expandDeck({ cards }) {
  const out = [];
  for (const card of cards) {
    const { copies = 1, ...rest } = card;
    for (let i = 0; i < copies; i++) out.push({ ...rest });
  }
  return out;
}

export function findBuilding(economy, id) {
  return economy.buildings.find((b) => b.id === id) ?? null;
}

export function findEquipment(economy, id) {
  return economy.equipment.find((eq) => eq.id === id) ?? null;
}

/** Format a W amount for display, e.g. 7 -> "7 W". */
export function w(amount) {
  return `${amount} W`;
}
