// Poached (counter-offer + roll, or let go) and the Mayor's re-election drive (buy a Favor + seed
// networking_lunch, or pass) — both interactive pending decisions.

import assert from "node:assert/strict";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";

let passed = 0;
const ok = (l) => { passed++; console.log(`  ✓ ${l}`); };
const economy = await loadEconomy();
const decks = await loadDecks();
function game() {
  resetIds();
  const g = new Game(economy, [{ name: "A", service: "mechanic" }], { seed: 1, fortune: decks.fortune });
  g.start();
  g.state.pendingPoach = []; g.state.pendingMayor = []; // clear any turn-1 draw so the test is clean
  return g;
}
const nl = (p) => p.deck.source.filter((c) => c.id === "networking_lunch").length;

// --- Poached ----------------------------------------------------------------------------------
{
  const g = game(); const p = g.state.players[0]; const wid = p.tradesmen[0].id;
  g.state.pendingPoach.push({ playerId: p.id, workerId: wid });
  g.resolvePoach(wid, { counter: 0 });
  assert.equal(p.tradesmen.find((t) => t.id === wid), undefined);
  ok("poach: let them go → worker leaves (free)");
}
{
  const g = game(); const p = g.state.players[0]; const wid = p.tradesmen[0].id; const cash = p.cash;
  g.state.pendingPoach.push({ playerId: p.id, workerId: wid });
  g.resolvePoach(wid, { counter: 2, roll: 3 }); // 3 ≤ 4 → stays
  assert.ok(p.tradesmen.find((t) => t.id === wid));
  assert.equal(cash - p.cash, 2);
  ok("poach: counter 2W + roll 3 → stays, paid 2");
}
{
  const g = game(); const p = g.state.players[0]; const wid = p.tradesmen[0].id; const cash = p.cash;
  g.state.pendingPoach.push({ playerId: p.id, workerId: wid });
  g.resolvePoach(wid, { counter: 2, roll: 5 }); // 5 > 4 → walks anyway
  assert.equal(p.tradesmen.find((t) => t.id === wid), undefined);
  assert.equal(cash - p.cash, 2);
  ok("poach: counter 2W + roll 5 → walks, still paid 2");
}

// --- Mayor's drive ----------------------------------------------------------------------------
{
  const g = game(); const p = g.state.players[0]; p.cash = 30; const before = nl(p);
  g.state.pendingMayor.push({ playerId: p.id });
  g.resolveMayor({ buy: true });
  assert.equal(p.cash, 20, "paid 10");
  assert.ok(p.hand.some((c) => c.type === "favor"), "gained a Favor");
  assert.equal(nl(p), before + 3, "+3 networking_lunch seeded");
  ok("mayor: buy → −10 W, a Favor, +3 networking_lunch in the deck");
}
{
  const g = game(); const p = g.state.players[0]; p.cash = 30;
  g.state.pendingMayor.push({ playerId: p.id });
  g.resolveMayor({ buy: false });
  assert.equal(p.cash, 30, "no spend");
  assert.ok(!p.hand.some((c) => c.type === "favor"));
  ok("mayor: pass → nothing spent");
}
{
  const g = game(); const p = g.state.players[0]; p.cash = 3;
  g.state.pendingMayor.push({ playerId: p.id });
  g.resolveMayor({ buy: true }); // can't afford
  assert.equal(p.cash, 3);
  ok("mayor: can't afford → passes");
}

console.log(`\nAll poach/mayor checks passed (${passed}).`);
