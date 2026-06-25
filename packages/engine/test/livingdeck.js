// The living deck — mini-game outcomes inject/remove cards from a player's own deck (or all of them),
// each followed by a reshuffle, and queue a deckEvent for the UI shuffle reveal.

import assert from "node:assert/strict";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { injectById, injectAllById, pullJobs } from "../src/engine/livingdeck.js";

let passed = 0;
const ok = (l) => { passed++; console.log(`  ✓ ${l}`); };
const economy = await loadEconomy();
const decks = await loadDecks();
const game = (n = 2) => {
  resetIds();
  const g = new Game(economy, Array.from({ length: n }, (_, i) => ({ name: "P" + i, service: "mechanic" })), { seed: 1, fortune: decks.fortune });
  g.start();
  return g;
};
const jobs = (p) => p.deck.source.filter((c) => c.type === "job" && !c.subcontract && !c.political).length;

{
  const g = game();
  assert.ok(g.state.cardPool.length > 0, "card pool present");
  ok("state.cardPool holds the master Fortune composition");
}
{
  const g = game();
  const p = g.state.players[0];
  const before = p.deck.source.length;
  injectById(g.state, p, "networking_lunch", 3, "Mayor donation");
  assert.equal(p.deck.source.length, before + 3);
  assert.ok(p.deck.source.filter((c) => c.id === "networking_lunch").length >= 3);
  ok("injectById adds copies to one player's deck + reshuffles");
}
{
  const g = game(3);
  const before = g.state.players.map((p) => p.deck.source.length);
  injectAllById(g.state, "union_drive", 1, "fired a worker");
  g.state.players.forEach((p, i) => assert.equal(p.deck.source.length, before[i] + 1));
  ok("injectAllById hits every solvent player's deck");
}
{
  const g = game();
  const p = g.state.players[0];
  const b = jobs(p);
  const removed = pullJobs(g.state, p, 2, "Hettrick's grumbling");
  assert.equal(removed, 2);
  assert.equal(jobs(p), b - 2);
  ok("pullJobs removes plain job cards (bad word of mouth)");
}
{
  const g = game();
  injectById(g.state, g.state.players[0], "networking_lunch", 1, "test");
  assert.ok(g.state.deckEvents.length >= 1);
  ok("reshapes queue a deckEvent for the shuffle UI");
}

console.log(`\nAll living-deck checks passed (${passed}).`);
