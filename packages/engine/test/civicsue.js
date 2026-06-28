// C: when a civic collapses, the PM (who loses their sizable bonus) may sue each contractor who
// defaulted on their share — recovering the share value (capped at what they can pay).
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { startCivic, tickCivics, resetCivics } from "../src/engine/civics.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();

resetIds(); resetCivics();
const g = new Game(economy, [{ name: "PM", service: "mechanic" }, { name: "Def", service: "plumber" }], { ...decks, seed: 1, difficulty: "standard" });
g.start();
const [pm, def] = g.state.players;
pm.cash = 50; def.cash = 50;

const card = { id: "cv_test", name: "Test civic", deadline: 2, favor_reward: 1, global_penalty: { name: "Test overrun", kind: "levy", magnitude: 1, turns: 2 } };
startCivic(g.state, pm, card);
const civic = g.state.civics[0];
civic.contracts.find((c) => c.player_id === pm.id).done = true; // PM delivered; the Def defaults
g.state.turn = civic.deadline_turn + 1;
tickCivics(g.state);

const claim = g.state.pendingDamages.find((c) => c.hirerId === pm.id && c.contractorId === def.id);
assert.ok(claim, "PM gets a damages claim against the defaulter");
assert.equal(claim.recipientId, pm.id, "damages recover to the PM, not the bank");

const pm0 = pm.cash, def0 = def.cash, owed = claim.value;
g.sueDamages(claim.jobId); // PM (current player) sues
g.respondToThreat({ contest: false }); // defaulter folds
assert.equal(pm.cash, pm0 + owed, "PM recovers the defaulted share");
assert.equal(def.cash, def0 - owed, "defaulter pays the PM");

console.log(`✓ civic default → PM sues defaulter → recovers ${owed}W`);
console.log("All civic-sue checks passed (1).");
