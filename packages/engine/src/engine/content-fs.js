// Node-only content loaders (filesystem). Kept separate from economy.js so the engine core
// stays browser/Deno-safe. The CLI, tests, and tuning harness use these; the web client will
// instead import the JSON directly (Vite handles JSON imports) and pass it to the engine.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { validateEconomy, expandDeck } from "./economy.js";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const readJson = async (file) => JSON.parse(await readFile(join(DATA_DIR, file), "utf8"));

/** Load and validate economy.json. */
export async function loadEconomy() {
  return validateEconomy(await readJson("economy.json"));
}

/** Load one deck file (e.g. "fortune"), copies-expanded. */
export async function loadDeck(name) {
  return expandDeck(await readJson(`${name}.json`));
}

/** Load all three decks (fortune, jobprogress, civil) as flat, copies-expanded arrays. */
export async function loadDecks() {
  const [fortune, jobprogress, civil] = await Promise.all([
    loadDeck("fortune"),
    loadDeck("jobprogress"),
    loadDeck("civil"),
  ]);
  return { fortune, jobprogress, civil };
}

/** Load the cosmetic flavor (town, seasons, award). Returns null if the file is absent. */
export async function loadFlavor() {
  try {
    return await readJson("flavor.json");
  } catch {
    return null;
  }
}
