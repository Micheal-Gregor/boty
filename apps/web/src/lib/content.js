// Browser content loader. Vite imports the engine's JSON data directly, and the engine's pure
// `expandDeck` / `validateEconomy` turn it into what the Game wants — no filesystem involved.
// (This is the payoff of decoupling the engine core from Node's fs.)

import economy from "@boty/engine/data/economy.json";
import fortuneRaw from "@boty/engine/data/fortune.json";
import jobprogressRaw from "@boty/engine/data/jobprogress.json";
import civilRaw from "@boty/engine/data/civil.json";
import flavor from "@boty/engine/data/flavor.json";
import { expandDeck, validateEconomy } from "@boty/engine";

export function loadContent() {
  validateEconomy(economy);
  return {
    economy,
    decks: {
      fortune: expandDeck(fortuneRaw),
      jobprogress: expandDeck(jobprogressRaw),
      civil: expandDeck(civilRaw),
    },
    flavor,
  };
}
