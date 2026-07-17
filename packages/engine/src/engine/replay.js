// Deterministic lockstep for online play. The engine is seeded, so two Games built with the same
// seed + seats and fed the SAME ordered list of moves end in byte-identical state. recordable(game)
// wraps a Game so every mutating call is appended to a move log as it's played; replay(game, log)
// re-applies that log to a fresh same-seed game. Clients share only the seed + the move log — never
// the live, closure-laden state — and each rebuilds the game locally. (See game.js / deck.js: the
// PRNG is mulberry32 seeded for exactly this "tests and replays can fix a seed" purpose.)

// The mutating moves worth logging. Everything else on the Game (getters, threshold queries, start)
// is either pure or part of identical game construction, so it never needs to travel.
export const INTENTS = new Set([
  "assignJob", "holdJob", "resumeJob", "dropJob", "sellJob",
  "hire", "fire", "buyEquipment", "rentEquipment", "cancelRental", "disposeEquipment",
  "assignEquipment", "unassignEquipment",
  "buyService", "cancelService", "fixDefect",
  "drawCredit", "repayCredit", "factorInvoice", "factorClaim", "payPayable",
  "playRush", "playBuyTime", "playSabotage", "favorSabotage", "playFavor",
  "sue", "sueDamages", "respondToThreat", "offerSettlement", "respondSettlement", "favorDropSuit",
  "resolveCourt", "resolveSettle", "resolvePoach", "resolveMayor", "resolveReferral", "decideRouting",
  "settleEstateClaim", "courtEstateClaim",
  "autoResolveCourt", "autoResolveSettle", "autoResolvePoach", "autoResolveMayor", "autoResolveReferral", "autoResolveDamages", "autoResolveEstate",
  "improveShop", "relocate", "startExpansion",
  "seatReckoning", "advanceReckoning", "closeBooks", "endTurn",
  "takeoverSeat", "reclaimSeat",
]);

/** Wrap a Game so each successful mutating call is appended to `moves`. Reads pass through untouched.
 *  Recording happens AFTER the call returns, so a rejected (illegal) move is never logged. */
export function recordable(game, moves = []) {
  return new Proxy(game, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val !== "function") return val;
      if (!INTENTS.has(prop)) return val.bind(target);
      return (...args) => {
        const result = val.apply(target, args);
        // Args must be JSON-serializable to survive the move log. A function arg (e.g. a callback)
        // would vanish on replay and desync the clients — fail loud in dev.
        if (args.some((a) => typeof a === "function")) {
          // eslint-disable-next-line no-console
          console.error(`[lockstep] move "${prop}" was logged with a function argument — it will not serialize. Pass plain data instead.`);
        }
        moves.push({ m: prop, a: args });
        return result;
      };
    },
  });
}

/** Apply moves[from..] to a fresh same-seed game, bringing it level. Returns the new cursor. */
export function replay(game, moves, from = 0) {
  for (let i = from; i < moves.length; i++) {
    const mv = moves[i];
    if (mv && typeof game[mv.m] === "function") game[mv.m](...(mv.a ?? []));
  }
  return moves.length;
}
