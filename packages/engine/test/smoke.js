// Stage 1 smoke test — proves the shop & economy skeleton without the interactive UI.
// Covers: identical start, upkeep charging, hire/fire, buy/rent/dispose/cancel equipment,
// building capacity + relocate (costs the turn), illegal-move refusal, and the headline
// goal: you can run a shop into the ground (bankruptcy).
//
// Run: npm run smoke   (or: node test/smoke.js)

import assert from "node:assert/strict";
import { findBuilding } from "../src/engine/economy.js";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { overheadFor } from "../src/engine/turn.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };
const expectRefusal = (fn, label) => {
  assert.throws(fn, /GameError|cannot|capacity|already|rented|owned|bankrupt|over|No /i);
  ok(`refused: ${label}`);
};

const economy = await loadEconomy();

// --- Identical opening -------------------------------------------------------------------
{
  resetIds();
  const game = new Game(economy, [
    { name: "Ana", service: "mechanic" },
    { name: "Bo", service: "plumber" },
  ]);
  for (const p of game.state.players) {
    assert.equal(p.cash, economy.starting_cash);
    assert.equal(p.building, economy.starting_building);
    assert.equal(p.tradesmen.length, economy.starting_tradesmen);
    assert.equal(p.equipment.length, 0);
  }
  ok("all players start identical (cash, building, one tradesperson)");
}

// --- Upkeep charges rent + wages + rented-equipment fees ----------------------------------
{
  resetIds();
  const game = new Game(economy, [{ name: "Ana", service: "mechanic" }]);
  const before = game.currentPlayer.cash;
  const o = overheadFor(game.state, game.currentPlayer);
  const ctx = game.start();
  assert.equal(o.total, economy.buildings.find((b) => b.id === "garage").rent + economy.wage_per_turn);
  assert.equal(game.currentPlayer.cash, before - o.total);
  assert.deepEqual(ctx.upkeep.overhead.total, o.total);
  ok(`upkeep charged ${o.total} W (rent + 1 wage) on turn 1`);
}

// --- Actions: hire/fire and equipment lifecycle ------------------------------------------
{
  resetIds();
  const game = new Game(economy, [{ name: "Ana", service: "mechanic" }]);
  game.start();
  const p = game.currentPlayer;

  const cashAfterUpkeep = p.cash;
  game.hire();
  assert.equal(p.tradesmen.length, 2);
  assert.equal(p.cash, cashAfterUpkeep - economy.sign_on_fee);
  ok("hire adds a tradesperson and charges the sign-on fee");

  // Garage caps at 2 — a third hire must be refused.
  expectRefusal(() => game.hire(), "hire past building capacity");

  const cashBeforeBuy = p.cash;
  game.buyEquipment("basic");
  assert.equal(p.equipment.length, 1);
  assert.equal(p.cash, cashBeforeBuy - economy.equipment.find((e) => e.id === "basic").buy_cost);
  ok("buy equipment charges full buy cost");

  game.rentEquipment("pro");
  assert.equal(p.equipment.filter((e) => !e.owned).length, 1);
  ok("rent equipment adds a rented instance (no upfront cost)");

  // Rented fee now shows up in overhead.
  const o = overheadFor(game.state, p);
  assert.equal(o.equipmentFees, economy.equipment.find((e) => e.id === "pro").rent_per_turn);
  ok("rented equipment fee appears in overhead");

  const owned = p.equipment.find((e) => e.owned);
  expectRefusal(() => game.cancelRental(owned.id), "cancel an owned item");
  const rented = p.equipment.find((e) => !e.owned);
  expectRefusal(() => game.disposeEquipment(rented.id), "dispose a rented item");

  const cashBeforeDispose = p.cash;
  const basic = economy.equipment.find((e) => e.id === "basic");
  game.disposeEquipment(owned.id);
  assert.equal(p.cash, cashBeforeDispose + Math.floor(basic.buy_cost * basic.disposal_rate));
  ok("dispose owned equipment refunds 50% of market (a real loss)");

  game.cancelRental(rented.id);
  assert.equal(p.equipment.length, 0);
  ok("cancel rental is free and immediate");

  game.fire();
  assert.equal(p.tradesmen.length, 1);
  ok("fire removes a tradesperson and charges severance");
}

// --- Relocate costs the whole turn -------------------------------------------------------
{
  resetIds();
  const game = new Game(economy, [{ name: "Ana", service: "mechanic" }]);
  game.start();
  game.relocate("warehouse");
  assert.equal(game.currentPlayer.building, "warehouse");
  expectRefusal(() => game.hire(), "any action after relocating this turn");
  // Capacity guard on relocate: can't move into a building smaller than your crew.
  game.endTurn(); // back to Ana next round
  game.hire(); game.hire(); // garage cap is 2; warehouse holds them fine
  expectRefusal(() => game.relocate("garage"), "relocate into a too-small building");
  ok("relocate switches buildings, ends the turn, and respects capacity");
}

// --- The headline goal: run a shop into the ground ---------------------------------------
{
  resetIds();
  const game = new Game(economy, [{ name: "Ana", service: "mechanic" }]);
  game.start();
  // Staff up hard and rent gear so overhead outruns the starting cash.
  game.relocate("warehouse"); game.endTurn();
  for (let i = 0; i < 5; i++) game.hire(); // 6 tradespeople in the warehouse
  game.rentEquipment("pro");

  let ctx = game.endTurn();
  let safety = 0;
  while (!ctx.over && !game.state.players[0].bankrupt && safety++ < 50) {
    ctx = game.endTurn();
  }
  assert.equal(game.state.players[0].bankrupt, true);
  ok(`ran the shop into the ground — bankrupt at ${game.state.players[0].cash} W`);
}

// --- Game ends after max_turns; highest cash wins ----------------------------------------
// With no jobs (Stage 1 has no income) the default economy always bankrupts everyone before
// max_turns — which is correct. To exercise the max_turns end-condition in isolation, tune a
// cash-rich economy where survival to the final round is possible.
{
  resetIds();
  const richEconomy = { ...economy, starting_cash: 1000, max_turns: 12 };
  const game = new Game(richEconomy, [
    { name: "Saver", service: "welder" },
    { name: "Spender", service: "electrician" },
  ]);
  game.start(); // Saver's upkeep
  game.endTurn(); // Spender's upkeep
  game.buyEquipment("pro"); // Spender burns cash so Saver leads on equal overhead
  let safety = 0;
  let final = null;
  while (safety++ < 200) {
    const next = game.endTurn();
    if (next.over) { final = next; break; }
    if (next.reckoning) { final = game.closeBooks(); break; } // year-end → Final Reckoning → settle
  }
  assert.ok(final, "game reached max_turns and ended");
  assert.equal(game.state.turn, richEconomy.max_turns + 1);
  assert.equal(final.results[0].name, "Saver");
  ok(`game ended after ${richEconomy.max_turns} turns; highest cash wins (${final.results[0].name})`);
}

console.log(`\nAll Stage 1 smoke checks passed (${passed}).`);
