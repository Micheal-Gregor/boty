// Season derivation — shared by the renderer (banner) and the Fortune resolver (seasonal card
// flavor). Pure presentation: the season is computed from progress through the fiscal year
// (turn / max_turns) split evenly across the configured seasons. No mechanical effect.

const DEFAULT_SEASONS = ["Spring", "Summer", "Fall", "Winter"];

export function seasonFor(state) {
  const seasons = state.flavor?.seasons ?? DEFAULT_SEASONS;
  const per = Math.max(1, Math.ceil(state.economy.max_turns / seasons.length));
  const index = Math.min(seasons.length - 1, Math.floor((state.turn - 1) / per));
  return { name: seasons[index], index, roundInSeason: ((state.turn - 1) % per) + 1, per };
}

export function seasonName(state) {
  return seasonFor(state).name;
}
