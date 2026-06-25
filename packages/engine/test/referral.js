// The referral wild card — a job that isn't your trade. Broker it to a shop that can do it: they
// accept (you collect a finder's fee) or refuse (nothing); no such shop → the bank pays the fee.

import assert from "node:assert/strict";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { Deck, makeRng } from "../src/engine/deck.js";
import { drawFortune } from "../src/engine/fortune.js";

let passed = 0;
const ok = (l) => { passed++; console.log(`  ✓ ${l}`); };
const economy = await loadEconomy();
const decks = await loadDecks();

// die→1 makes the referral pick others[0]; for a mechanic that's "plumber".
function setup(seats) {
  resetIds();
  const g = new Game(economy, seats, { seed: 1, fortune: decks.fortune });
  g.start();
  for (const p of g.state.players) p.jobs = [];
  g.state.pendingReferral = [];
  g.state.die = () => 1;
  return g;
}
const drawRef = (g, p, size = "j2") => { p.deck = new Deck([{ type: "referral", size, id: "ref", name: "Ref" }], makeRng(1)); return drawFortune(g.state, p, 1)[0]; };

// accept → contractor does it, referrer earns the fee
{
  const g = setup([{ name: "M", service: "mechanic" }, { name: "P", service: "plumber" }]);
  const [m, p] = g.state.players;
  drawRef(g, m);
  assert.equal(g.state.pendingReferral.length, 1);
  const r = g.state.pendingReferral[0];
  assert.equal(r.contractor_id, p.id, "routed to the plumber");
  const cash0 = m.cash;
  g.resolveReferral(r.id, { accept: true });
  assert.equal(p.jobs.length, 1, "contractor took the job");
  assert.equal(m.cash, cash0 + r.fee, "referrer collected the finder's fee");
  ok("referral: accept → contractor does it, referrer earns the fee");
}
// refuse → referrer gets nothing
{
  const g = setup([{ name: "M", service: "mechanic" }, { name: "P", service: "plumber" }]);
  const [m, p] = g.state.players;
  drawRef(g, m);
  const r = g.state.pendingReferral[0]; const cash0 = m.cash;
  g.resolveReferral(r.id, { accept: false });
  assert.equal(p.jobs.length, 0, "no job for the contractor");
  assert.equal(m.cash, cash0, "no fee on a refusal");
  ok("referral: refuse → referrer gets nothing");
}
// no shop with the trade → the bank pays the fee, no pending
{
  const g = setup([{ name: "M", service: "mechanic" }]);
  const m = g.state.players[0];
  const cash0 = m.cash;
  drawRef(g, m);
  assert.equal(g.state.pendingReferral.length, 0, "nobody to refer to → no pending");
  assert.ok(m.cash > cash0, "the bank paid the finder's fee");
  ok("referral: no shop with that trade → the county pays the fee");
}
// the bot contractor takes it when it has crew to spare
{
  const g = setup([{ name: "M", service: "mechanic" }, { name: "P", service: "plumber" }]);
  const [m, p] = g.state.players;
  drawRef(g, m);
  g.autoResolveReferral();
  assert.equal(g.state.pendingReferral.length, 0);
  assert.equal(p.jobs.length, 1, "contractor accepted (had room)");
  ok("autoResolveReferral: contractor takes it with crew to spare");
}

console.log(`\nAll referral checks passed (${passed}).`);
