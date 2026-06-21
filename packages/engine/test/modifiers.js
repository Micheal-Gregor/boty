// Persistent-modifier test (slice 3) — insurance (deductible), marketing (deck injection), Favor.

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { buyService, hasModifier, tickModifiers, bearLoss, marketingInjection } from "../src/engine/modifiers.js";
import { profitAndLoss } from "../src/state/ledger.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };
const economy = await loadEconomy();

// Insurance: a standing modifier whose premium posts to overhead, and which halves a loss.
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0];
  g.buyService("insurance");
  assert.ok(hasModifier(ana, "insurance"), "insurance modifier in play");

  const ohBefore = profitAndLoss(ana).overhead;
  const cashBefore = ana.cash;
  tickModifiers(g.state, ana); // an upkeep tick
  assert.equal(ana.cash, cashBefore - 1, "premium charged in cash");
  assert.equal(profitAndLoss(ana).overhead, ohBefore + 1, "premium posts to overhead (6200)");

  assert.deepEqual(bearLoss(ana, 4), { borne: 2, covered: 2, insured: true }, "a 4 W loss → 2 W deductible, 2 W covered");
  ok("insurance: premium = overhead, and it turns a loss into a deductible");
}

// Marketing: injects a job card into the draws.
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0];
  assert.equal(marketingInjection(ana), null, "no injection without marketing");
  g.buyService("marketing");
  const inj = marketingInjection(ana);
  assert.ok(inj && inj.type === "job", "marketing injects a job card into the draw");
  ok("marketing: injects extra work into your deck");
}

// Favor: cancels a rival's standing perk, and consumes the card.
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }, { name: "Boe", service: "plumber" }], { seed: 1 });
  g.start();
  const [ana, boe] = g.state.players;
  buyService(g.state, boe, "insurance"); // the rival carries insurance
  ana.hand.push({ id: "f1", type: "favor", name: "Favor" });
  g.playFavor(boe.id, "insurance");
  assert.ok(!hasModifier(boe, "insurance"), "the favor cancelled the rival's insurance");
  assert.ok(!ana.hand.some((c) => c.type === "favor"), "the favor card was consumed");
  ok("favor: cuts a rival's standing perk short (scarce, one-shot)");
}

console.log(`\nAll modifier checks passed (${passed}).`);
