// B: readying a move charges the NEW building's higher rent immediately, and a fit-out contractor
// who stalls can be sued by the mover (who's now paying that rent for an unfinished building).
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { overheadFor } from "../src/engine/turn.js";
import { onReadyingBotch } from "../src/engine/expansion.js";
import { findBuilding } from "../src/engine/economy.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();

resetIds();
const g = new Game(economy, [{ name: "Mover", service: "mechanic" }, { name: "Plumber", service: "plumber" }], { ...decks, seed: 1, difficulty: "standard" });
g.start();
const [mover, plumber] = g.state.players;
const here = findBuilding(economy, mover.building);
const bigger = economy.buildings.find((b) => (b.tier ?? 1) > (here.tier ?? 1));

// High rent NOW: while readying a move, overhead bills the target building's rent.
const baseRent = overheadFor(g.state, mover).rent;
assert.equal(baseRent, here.rent, "before readying: the current (low) rent");
mover.pendingExpansion = { target: bigger.id, isImprove: false, targetName: bigger.name, readyTurn: g.state.turn + 1 };
assert.equal(overheadFor(g.state, mover).rent, bigger.rent, "while readying: the NEW building's rent");
assert.ok(bigger.rent > here.rent, "which is higher than the old shop's");
mover.pendingExpansion = null;

// Sue a staller: a fit-out portion the plumber holds for the mover, expired.
const job = { id: "ready_plumber", name: "Ready the shop — plumber fit-out", value: 6, readying: true, readying_for: mover.id };
plumber.jobs.push(job);
const line = onReadyingBotch(g.state, plumber, job);
assert.ok(line, "a stalled fit-out → the mover may sue");
const claim = g.state.pendingDamages.find((c) => c.hirerId === mover.id && c.contractorId === plumber.id);
assert.ok(claim, "mover gets a damages claim against the staller");
assert.equal(claim.recipientId, mover.id, "recovers to the mover, not the bank");
assert.equal(claim.value, 6, "for the fit-out contract value");

console.log("✓ readying charges the new rent now; a stalling fit-out contractor is suable");
console.log("All expansion-sue checks passed (1).");
