// @boty/engine — public API barrel. PURE and environment-agnostic (no filesystem / Node
// built-ins), so it imports cleanly in Node, the browser (Vite), and Deno. Node consumers that
// want filesystem content loaders import them from "@boty/engine/content-fs".
//
// The whole game is driven through `Game`: construct it, then call its methods — they are the
// only legal moves, and any illegal one throws `GameError`. The `state` it holds is plain JSON,
// which is exactly what an online server persists and broadcasts.

export { Game } from "./src/engine/game.js";
export { GameError, findBuilding, findEquipment, w, validateEconomy, expandDeck } from "./src/engine/economy.js";
export {
  createGame, createPlayer, createTradesman, createEquipment, createJob, createInvoice, createPayable, resetIds,
} from "./src/state/state.js";
export { Deck, makeRng } from "./src/engine/deck.js";
export { makeDie } from "./src/engine/dice.js";
export { seasonFor, seasonName } from "./src/engine/season.js";
export { recurringExpenses } from "./src/engine/turn.js";
export { workerProductivity, jobWorkScore } from "./src/engine/jobs.js";
export { classifyTermination, fireWorker, performanceReview, unionActive } from "./src/engine/employment.js";
export { injectById, injectAllById, removeMatching, pullJobs } from "./src/engine/livingdeck.js";
export { SERVICES, premiumsFor } from "./src/engine/modifiers.js";
export { INTENTS, recordable, replay } from "./src/engine/replay.js";
export { profitAndLoss, balanceSheet, balances, ACCT, ACCT_NAME } from "./src/state/ledger.js";
