// G: a landed sabotage rolls a CAUGHT die. Caught → the victim may sue the saboteur for damages
// (recovered). Got away → nothing. (Countered by Rush never reaches the catch roll.)
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();

function setup() {
  resetIds();
  const g = new Game(economy, [{ name: "Att", service: "mechanic" }, { name: "Vic", service: "plumber" }], { ...decks, seed: 1, difficulty: "standard" });
  g.start();
  const [att, vic] = g.state.players;
  att.hand.push({ id: "sabotage", type: "sabotage", name: "Sabotage" });
  vic.jobs.push({ id: "VJ1", name: "Victim job", state: "Active", work_done: 2, work_amount: 8, value: 10, deadline_turn: 12, assigned_tradesmen: [], max_tradesmen: 2, min_tradesmen: 1, droppable: true });
  return { g, att, vic };
}

// Caught (die ≤ sabotage_caught) → the victim gets a damages claim.
{
  const { g, att, vic } = setup();
  g.playSabotage("VJ1");
  assert.equal(g.state.pendingThreat?.type, "sabotage", "sabotage threat opened");
  g.state.die = () => 1; // caught
  g.respondToThreat({ counter: false });
  const claim = g.state.pendingDamages.find((c) => c.hirerId === vic.id && c.contractorId === att.id);
  assert.ok(claim, "caught → the victim may sue the saboteur");
  assert.equal(claim.recipientId, vic.id, "damages recover to the victim");
  assert.equal(claim.value, economy.cards.sabotage_damages, "for the sabotage-damages amount");
  console.log("  ✓ caught red-handed → suable");
}

// Got away (die > sabotage_caught) → no claim.
{
  const { g, att, vic } = setup();
  g.playSabotage("VJ1");
  g.state.die = () => 6; // got away
  g.respondToThreat({ counter: false });
  assert.ok(!g.state.pendingDamages.some((c) => c.contractorId === att.id), "got away clean → no suit");
  console.log("  ✓ got away → no suit");
}

console.log("All sabotage-sue checks passed (2).");
