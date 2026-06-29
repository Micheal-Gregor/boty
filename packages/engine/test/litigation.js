// Persistent litigation: damages claims stay open all game; the defendant can settle (pay half) or
// spend a Favor to drop the suit; the plaintiff accepts or refuses a settlement.
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();
let n = 0; const ok = (m) => { n++; console.log(`  ✓ ${m}`); };

const setup = () => {
  resetIds();
  const g = new Game(economy, [{ name: "Plaintiff", service: "mechanic" }, { name: "Defendant", service: "plumber" }], { ...decks, fortune: [], seed: 1 });
  g.start();
  const [pl, def] = g.state.players;
  pl.cash = 20; def.cash = 20;
  g.state.pendingDamages.push({ hirerId: pl.id, contractorId: def.id, jobId: "J1", jobName: "Test job", value: 10, recipientId: pl.id });
  return { g, pl, def };
};
const seat = (g, p) => { g.state.activePlayerIndex = g.state.players.indexOf(p); };
const claim = (g) => g.state.pendingDamages.find((c) => c.jobId === "J1");

// (1) Settle, accepted: defendant pays half, suit closes, money moves.
{
  const { g, pl, def } = setup();
  seat(g, def); g.offerSettlement("J1");
  assert.equal(claim(g).settlement, 5, "offer is half the claim");
  seat(g, pl); g.respondSettlement("J1", true);
  assert.equal(claim(g), undefined, "suit closed");
  assert.equal(def.cash, 15, "defendant paid the 5W settlement");
  assert.equal(pl.cash, 25, "plaintiff collected it");
  ok("settlement accepted: defendant pays half, suit closes");
}

// (2) Settle, refused: offer withdrawn, suit persists.
{
  const { g, pl, def } = setup();
  seat(g, def); g.offerSettlement("J1");
  seat(g, pl); g.respondSettlement("J1", false);
  assert.ok(claim(g), "the suit still stands");
  assert.equal(claim(g).settlement, null, "the offer is withdrawn");
  assert.equal(def.cash, 20, "no money moved");
  ok("settlement refused: offer withdrawn, suit stands");
}

// (3) Favor-drop: the defendant spends a Favor to make the suit disappear.
{
  const { g, def } = setup();
  def.hand.push({ id: "favor", type: "favor", name: "Favor" });
  seat(g, def); g.favorDropSuit("J1");
  assert.equal(claim(g), undefined, "the suit is dropped");
  assert.ok(!def.hand.some((c) => c.type === "favor"), "the Favor was consumed");
  ok("Favor-drop: defendant spends a Favor to kill the suit");
}

// (4) A plaintiff sees their claim as pursuable, defendant sees it as a suit against them.
{
  const { g, pl, def } = setup();
  seat(g, pl); assert.equal(g.damagesCases.length, 1, "plaintiff can pursue it");
  assert.equal(g.suitsAgainstMe.length, 0, "plaintiff has no suits against them");
  seat(g, def); assert.equal(g.suitsAgainstMe.length, 1, "defendant sees the suit against them");
  assert.equal(g.damagesCases.length, 0, "defendant has nothing to pursue");
  ok("claims route to plaintiff (pursue) vs defendant (settle/Favor)");
}

console.log(`All litigation checks passed (${n}).`);
