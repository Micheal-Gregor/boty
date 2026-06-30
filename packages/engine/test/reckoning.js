// Final Reckoning (Last Licks) stepping — game.advanceReckoning walks the FIXED trailing-first order,
// seating each solvent HUMAN seat in turn (bots and bankrupt shops take no last licks), then closes the
// books. It's a recorded intent so every online client steps it in lockstep.
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();

// 1. Skips a bot, seats each human in order, then closes the books -----------------------------------
resetIds();
{
  const g = new Game(economy, [
    { name: "A", service: "mechanic" }, { name: "B", service: "plumber" }, { name: "C", service: "electrician" },
  ], { ...decks, seed: 3, difficulty: "standard" });
  g.start();
  const [A, B, C] = g.state.players;
  // Into the reckoning with a known order: C (a bot) trailing, then humans A then B.
  g.state.humanIds = [A.id, B.id];
  g.state.phase = "reckoning";
  g.state.reckoningOrder = [C.id, A.id, B.id];
  g.state.reckoningIdx = -1;

  g.advanceReckoning();
  assert.equal(g.state.players[g.state.activePlayerIndex].id, A.id, "bot C skipped → first HUMAN (A) is seated");
  assert.equal(g.state.reckoningIdx, 1, "index advanced past the bot to A");
  assert.equal(g.state.over, false, "not over yet");

  g.advanceReckoning();
  assert.equal(g.state.players[g.state.activePlayerIndex].id, B.id, "next human (B) is seated");
  assert.equal(g.state.reckoningIdx, 2);

  g.advanceReckoning();
  assert.equal(g.state.over, true, "every human's had their licks → books closed, game over");
  assert.equal(g.state.phase, "done");
  console.log("  ✓ steps each solvent HUMAN in order, skips bots, then closes the books");
}

// 2. A bankrupt human seat is skipped too ------------------------------------------------------------
resetIds();
{
  const g = new Game(economy, [
    { name: "A", service: "mechanic" }, { name: "B", service: "plumber" }, { name: "C", service: "electrician" },
  ], { ...decks, seed: 5, difficulty: "standard" });
  g.start();
  const [A, B, C] = g.state.players;
  B.bankrupt = true;
  g.state.humanIds = [A.id, B.id, C.id];
  g.state.phase = "reckoning";
  g.state.reckoningOrder = [A.id, B.id, C.id];
  g.state.reckoningIdx = -1;

  g.advanceReckoning();
  assert.equal(g.state.players[g.state.activePlayerIndex].id, A.id, "A seated");
  g.advanceReckoning();
  assert.equal(g.state.players[g.state.activePlayerIndex].id, C.id, "bankrupt B skipped → C");
  console.log("  ✓ a bankrupt seat is skipped in Last Licks");
}

// 3. Sabotage during Last Licks — a seat hits a rival's job AFTER that rival already finished their
//    turn. The window must resolve and the reckoning must still close (the reported freeze scenario).
resetIds();
{
  const g = new Game(economy, [
    { name: "A", service: "mechanic" }, { name: "B", service: "plumber" }, { name: "C", service: "electrician" },
  ], { ...decks, seed: 7, difficulty: "standard" });
  g.start();
  const [A, B] = g.state.players;
  A.hand.push({ id: "favor", type: "favor", name: "Favor" });
  B.jobs.push({ id: "bjob", name: "Test reno", state: "Active", work_done: 1, work_amount: 5, value: 10, assigned_tradesmen: [], hirer_id: null });
  g.state.humanIds = [A.id, B.id];
  g.state.phase = "reckoning";
  g.state.reckoningOrder = [B.id, A.id]; // B takes licks first, then A
  g.state.reckoningIdx = -1;
  g.advanceReckoning(); // seat B
  g.advanceReckoning(); // B done → seat A is up
  assert.equal(g.state.players[g.state.activePlayerIndex].id, A.id, "A is the active last-licks seat");

  g.favorSabotage("bjob"); // A spends a Favor to sabotage B's job (B already finished)
  assert.ok(g.state.pendingThreat, "sabotage opened the response window");
  g.respondToThreat({ counter: false }); // B doesn't rush → it lands
  assert.equal(g.state.pendingThreat, null, "the response window resolved — no deadlock");
  assert.ok(!B.jobs.some((j) => j.id === "bjob"), "B's job was sunk at the buzzer");

  g.advanceReckoning(); // A done → books close
  assert.equal(g.state.over, true, "A finishes → books closed, game over");
  console.log("  ✓ sabotage during Last Licks (target already finished) resolves + the reckoning closes");
}

console.log("All reckoning checks passed.");
