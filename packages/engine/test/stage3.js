// Stage 3 smoke test — the three decks as data. Verifies the Fortune deck composition and
// resolution (jobs/windfalls/shocks/gifts), draw-power scaling, the feast/famine
// no-reshuffle-until-exhausted mechanic, and the job-progress deck effects.
//
// Run: node test/stage3.js

import assert from "node:assert/strict";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds, createTradesman } from "../src/state/state.js";
import { Deck, makeRng } from "../src/engine/deck.js";
import { drawFortune } from "../src/engine/fortune.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };

const economy = await loadEconomy();
const decks = await loadDecks();

const count = (arr, pred) => arr.filter(pred).length;

function newGame(options) {
  resetIds();
  return new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1, ...options });
}

// --- Deck composition (copies expanded; Dial-1 / Dial-4 shares) ---------------------------
{
  assert.equal(decks.fortune.length, 87, "fortune deck is 87 cards");
  assert.equal(count(decks.fortune, (c) => c.size && c.type === "job"), 17, "the tailored job ladder (j1×4 j2×4 j3×3 j4×3 j5×2 j6×1)");
  assert.equal(count(decks.fortune, (c) => c.npc && c.type === "job"), 7, "NPC jobs (Hettrick×2 Lundgren×2 Dot×2 Boon×1)");
  assert.equal(count(decks.fortune, (c) => c.type === "review"), 1, "performance-review card");
  assert.equal(count(decks.fortune, (c) => c.type === "union"), 1, "union-drive card");
  assert.equal(count(decks.fortune, (c) => c.type === "civic"), 5, "civic builds (incl. the seasonal storm)");
  assert.equal(count(decks.fortune, (c) => c.type === "referral"), 3, "referral wild cards (1p/2p/3p)");
  assert.equal(count(decks.fortune, (c) => c.subcontract), 0, "named subcontract jobs removed (the j1–j6 ladder replaces them)");
  assert.equal(count(decks.fortune, (c) => c.type === "bbb_special"), 2, "BBB Special (services fair)");
  assert.equal(count(decks.fortune, (c) => c.type === "incident"), 2, "building incidents (grange, mill)");
  assert.equal(count(decks.fortune, (c) => c.type === "job"), 24, "jobs (17 ladder + 7 NPC)");
  assert.equal(count(decks.fortune, (c) => c.type === "defect"), 4, "code-violation / inspection defects");
  assert.equal(count(decks.fortune, (c) => c.type === "crew"), 6, "crew-life events");
  assert.equal(count(decks.fortune, (c) => c.type === "theft"), 1, "equipment theft");
  assert.equal(count(decks.fortune, (c) => c.type === "character"), 1, "character events");
  assert.equal(count(decks.fortune, (c) => c.type === "windfall"), 16, "windfalls (incl. count-scaling bonuses)");
  assert.equal(count(decks.fortune, (c) => c.type === "shock"), 9, "shocks (incl. weather + count-scaling)");
  assert.equal(count(decks.fortune, (c) => c.type === "payable"), 5, "NPC vendor bills");
  assert.equal(count(decks.fortune, (c) => c.type === "gift"), 4, "gifts");
  assert.equal(count(decks.fortune, (c) => c.type === "summons"), 2, "civil summons");
  assert.equal(count(decks.fortune, (c) => c.type === "retirement"), 1, "retirement churn card");
  // Count-scaling tilt: equipment net-positive copies, headcount net-negative copies.
  const perEq = decks.fortune.filter((c) => c.per_equipment);
  const perTr = decks.fortune.filter((c) => c.per_tradesman);
  assert.equal(perEq.filter((c) => c.per_equipment > 0).length, 4, "4 equipment-bonus cards");
  assert.equal(perEq.filter((c) => c.per_equipment < 0).length, 1, "1 equipment-penalty card");
  assert.equal(perTr.filter((c) => c.per_tradesman > 0).length, 1, "1 headcount-bonus card");
  assert.equal(perTr.filter((c) => c.per_tradesman < 0).length, 1, "1 headcount-penalty card (plus the retirement)");
  ok("fortune composition: count-scaling tilt (equipment +4/−1, headcount +1/−2 incl. retirement)");

  assert.equal(decks.jobprogress.length, 20);
  assert.equal(count(decks.jobprogress, (c) => c.slice === "neutral"), 8, "neutral ~40%");
  assert.equal(count(decks.jobprogress, (c) => c.slice === "positive"), 5, "positive ~25%");
  assert.equal(count(decks.jobprogress, (c) => c.slice === "negative"), 5, "negative ~25%");
  assert.equal(count(decks.jobprogress, (c) => c.slice === "decisive"), 2, "decisive ~10%");
  ok("job-progress deck composition matches Dial 4 (8/5/5/2 of 20)");

  assert.equal(count(decks.civil, (c) => c.id === "class_action"), 1, "exactly one Class Action");
  assert.ok(count(decks.civil, (c) => c.hand) >= 4, "civil hand cards present");
  ok("civil deck loaded; Class Action is a single copy");
}

// --- Feast/famine: fixed deck, draw WITHOUT reshuffle until exhausted ----------------------
{
  const cards = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const deck = new Deck(cards, makeRng(7));
  const firstPass = deck.drawN(4).map((c) => c.id).sort();
  assert.deepEqual(firstPass, ["a", "b", "c", "d"], "every card appears exactly once before any reshuffle");
  // Pile now empty; the next draw must reshuffle the full fixed set.
  const next = deck.draw();
  assert.ok(["a", "b", "c", "d"].includes(next.id), "reshuffles the full composition once exhausted");
  ok("fortune draws the whole season before reshuffling (no early reshuffle)");
}

// --- Fortune resolution: windfall / shock / gift ------------------------------------------
{
  const g = newGame({ fortune: [{ type: "windfall", id: "w", name: "Payout", cash: 5 }] });
  const before = g.currentPlayer.cash;
  const ctx = g.start();
  assert.equal(ctx.drawn[0].type, "windfall");
  // cash = before + 5 windfall − upkeep overhead (rent+wage).
  const o = economy.buildings.find((b) => b.id === "garage").rent + economy.wage_per_turn;
  assert.equal(g.currentPlayer.cash, before + 5 - o, "windfall adds cash immediately");
  ok("Fortune windfall pays out on draw");
}
{
  const g = newGame({ fortune: [{ type: "shock", id: "s", name: "Breakdown", cash: -4 }] });
  const before = g.currentPlayer.cash;
  g.start();
  const o = economy.buildings.find((b) => b.id === "garage").rent + economy.wage_per_turn;
  assert.equal(g.currentPlayer.cash, before - 4 - o, "shock subtracts cash immediately");
  ok("Fortune shock hits cash on draw");
}
{
  const g = newGame({
    fortune: [{ type: "gift", id: "g", name: "Lunch" }],
    civil: [{ hand: true, id: "rush", name: "Rush" }],
  });
  g.start();
  assert.equal(g.currentPlayer.hand.length, 1, "gift deals a Civil hand card");
  assert.equal(g.currentPlayer.hand[0].name, "Rush");
  ok("Fortune gift deals a Civil hand card into hand (inert until Stage 4)");
}

// --- Count-scaling cards (Dial 3 levers) — resolved directly to skip upkeep noise ---------
{
  const g = newGame({});
  const p = g.currentPlayer;
  p.equipment.push({ id: "E1", defId: "basic", owned: true }, { id: "E2", defId: "pro", owned: true });
  p.deck = new Deck([{ type: "windfall", id: "patent", name: "Patent", per_equipment: 2 }], makeRng(1));
  const before = p.cash;
  drawFortune(g.state, p, 1);
  assert.equal(p.cash, before + 4, "patent pays per_equipment × equipment (2 × 2)");
  ok("per_equipment card scales with equipment owned (rewards the equipment build)");
}
{
  const g = newGame({});
  const p = g.currentPlayer;
  p.tradesmen.push(createTradesman(), createTradesman()); // 3 total
  p.deck = new Deck([{ type: "shock", id: "ps", name: "Profit share", per_tradesman: -2 }], makeRng(1));
  const before = p.cash;
  drawFortune(g.state, p, 1);
  assert.equal(p.cash, before - 6, "profit-share docks per_tradesman × headcount (−2 × 3)");
  ok("per_tradesman card scales with headcount (taxes the over-hirer)");
}
{
  const g = newGame({});
  const p = g.currentPlayer;
  p.tradesmen.push(createTradesman()); // 2 total
  const n = p.tradesmen.length;
  p.deck = new Deck([{ type: "retirement", id: "ret", name: "Retire" }], makeRng(1));
  const before = p.cash;
  drawFortune(g.state, p, 1);
  assert.equal(p.tradesmen.length, n, "headcount unchanged — replacement hired");
  assert.equal(p.cash, before - economy.sign_on_fee, "retirement churn costs the sign-on fee");
  ok("retirement churns a tradesperson (pay to replace)");
}

// --- Seasonal card flavor (cosmetic; picked by current season) ----------------------------
{
  const weather = { type: "shock", id: "wx", name: "Bad weather", cash: -1, flavor: "generic squall", flavor_by_season: { Spring: "spring mud", Winter: "a blizzard buries Main Street" } };
  const g = newGame({});
  const p = g.currentPlayer;
  p.deck = new Deck([weather], makeRng(1));
  g.state.turn = 1; // Spring (max_turns 24 → 6 rounds/season)
  assert.equal(drawFortune(g.state, p, 1)[0].flavor, "spring mud", "Spring variant chosen");
  p.deck = new Deck([weather], makeRng(1));
  g.state.turn = 22; // Winter (turns 19–24)
  assert.equal(drawFortune(g.state, p, 1)[0].flavor, "a blizzard buries Main Street", "Winter variant chosen");
  p.deck = new Deck([weather], makeRng(1));
  g.state.turn = 8; // Summer (turns 7–12) — no variant defined → falls back to base flavor
  assert.equal(drawFortune(g.state, p, 1)[0].flavor, "generic squall", "falls back to base flavor when no seasonal variant");
  ok("seasonal flavor: the card reads differently by season, with a sane fallback");
}

// --- Draw-power scaling = capped headcount ------------------------------------------------
{
  const capEconomy = { ...economy, draw_cap: 2 };
  resetIds();
  const g = new Game(capEconomy, [{ name: "Ana", service: "mechanic" }], { seed: 1, fortune: decks.fortune });
  const p = g.currentPlayer;
  assert.equal(g.drawPowerFor(p), 1, "one tradesperson → draw 1");
  p.tradesmen.push(createTradesman(), createTradesman()); // 3 total
  assert.equal(g.drawPowerFor(p), 2, "draw power capped at draw_cap");
  ok("draw power = tradespeople, capped by draw_cap");
}

// --- Job-progress effects -----------------------------------------------------------------
const bigJob = { type: "job", id: "big", name: "Big job", value: 10, work_amount: 50, deadline: 9, min_tradesmen: 1, max_tradesmen: 1, required_equipment: null, droppable: true };

function activeBigJob(jobprogress) {
  const g = newGame({ fortune: [bigJob], jobprogress });
  g.start();
  const p = g.currentPlayer;
  g.assignJob(p.jobs[0].id);
  return { g, p, job: p.jobs[0] };
}

{
  // work bonus
  const { g, job } = activeBigJob([{ slice: "positive", id: "ahead", name: "Ahead", effect: { work: 5 } }]);
  g.runProgress();
  assert.equal(job.work_done, economy.base_hand_speed + 5, "work effect adds to progress");
  ok("job-progress 'work' effect speeds the job");
}
{
  // cost hit
  const { g, p } = activeBigJob([{ slice: "negative", id: "overrun", name: "Overrun", effect: { cost: 3 } }]);
  const before = p.cash;
  g.runProgress();
  assert.equal(p.cash, before - 3, "cost effect docks cash");
  ok("job-progress 'cost' effect hits cash");
}
{
  // decisive success completes regardless of remaining work
  const { g, p } = activeBigJob([{ slice: "decisive", id: "flawless", name: "Flawless", effect: { decisive: "success" } }]);
  g.runProgress();
  assert.equal(p.jobs.length, 0, "decisive success completed the job");
  assert.equal(p.invoices.length, 1, "completion created an invoice");
  ok("job-progress decisive SUCCESS completes the job → invoice");
}
{
  // decisive failure expires it, no pay
  const { g, p } = activeBigJob([{ slice: "decisive", id: "boom", name: "Catastrophe", effect: { decisive: "failure" } }]);
  g.runProgress();
  assert.equal(p.jobs.length, 0, "decisive failure removed the job");
  assert.equal(p.invoices.length, 0, "decisive failure pays nothing");
  assert.equal(p.tradesmen[0].assignedJob, null, "failure frees the crew");
  ok("job-progress decisive FAILURE fails the job → no pay");
}

console.log(`\nAll Stage 3 smoke checks passed (${passed}).`);
