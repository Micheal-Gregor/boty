// Final tier: private security (prevents theft / boosts the sabotage-catch) + theft escalation
// (a kept flagged thief keeps stealing, capped).
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { resolveCard } from "../src/engine/fortune.js";
import { tickTheftEscalation } from "../src/engine/crew.js";
import { buyService } from "../src/engine/modifiers.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();
let n = 0; const ok = (m) => { n++; console.log(`  ✓ ${m}`); };

// (1) Private security PREVENTS a theft — rig kept, no inside-job.
{
  resetIds();
  const g = new Game(economy, [{ name: "A", service: "mechanic" }, { name: "B", service: "plumber" }], { ...decks, fortune: [], seed: 1, difficulty: "standard" });
  g.start();
  const p = g.state.players[0];
  p.equipment.push({ id: "E1", defId: "basic", owned: true, assigned_to: null });
  buyService(g.state, p, "private_security");
  g.state.die = () => 1; // ≤ prevent threshold
  resolveCard(g.state, p, { type: "theft", id: "tool_theft", name: "Tool theft" });
  assert.equal(p.equipment.length, 1, "the rig is kept — security stopped the theft");
  ok("private security prevents theft");
}

// (2) Catch boost — a victim with security catches a saboteur on a roll that would otherwise escape.
{
  resetIds();
  const g = new Game(economy, [{ name: "Att", service: "mechanic" }, { name: "Vic", service: "plumber" }], { ...decks, fortune: [], seed: 1, difficulty: "standard" });
  g.start();
  const [att, vic] = g.state.players;
  att.hand.push({ id: "sabotage", type: "sabotage", name: "Sabotage" });
  buyService(g.state, vic, "private_security");
  vic.jobs.push({ id: "VJ", name: "job", state: "Active", work_done: 2, work_amount: 8, value: 10, deadline_turn: 12, assigned_tradesmen: [], max_tradesmen: 2, min_tradesmen: 1, droppable: true });
  g.playSabotage("VJ");
  g.state.die = () => economy.cards.sabotage_caught + 1; // would escape at base, but +catch_bonus catches it
  g.respondToThreat({ counter: false });
  assert.ok(g.state.pendingDamages.some((c) => c.contractorId === att.id), "security caught the saboteur at the boosted threshold");
  ok("private security boosts the sabotage-catch");
}

// (3) Theft escalation — a kept flagged thief slips more theft in, up to the cap.
{
  resetIds();
  const g = new Game(economy, [{ name: "A", service: "mechanic" }], { ...decks, seed: 1, difficulty: "standard" });
  g.start();
  const p = g.state.players[0];
  p.tradesmen.push({ id: "T9", prod_mod: 0, flag: "theft", assignedJob: null, out_until: null, tool: null });
  p.theftEscalations = 0;
  g.state.die = () => 1; // ≤ escalation_chance
  let injected = 0;
  for (let i = 0; i < 5; i++) if (tickTheftEscalation(g.state, p).length) injected++;
  assert.equal(injected, economy.theft.escalation_cap, "escalates up to the cap then stops");
  ok("a kept thief escalates theft, capped");
}

console.log(`All security checks passed (${n}).`);
