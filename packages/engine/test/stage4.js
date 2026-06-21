// Stage 4 smoke test — resolvers + hand/counter. Dice are made deterministic by overriding
// state.die with a scripted sequence, so every litigation outcome is exact.
//
// Run: node test/stage4.js

import assert from "node:assert/strict";
import { loadEconomy } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resetIds, createPayable, createEquipment } from "../src/state/state.js";
import { getawayThreshold } from "../src/engine/litigation.js";
import * as payables from "../src/engine/payables.js";
import * as defects from "../src/engine/defects.js";
import { runJobProgress } from "../src/engine/jobs.js";
import { runUpkeep } from "../src/engine/turn.js";

let passed = 0;
const ok = (label) => { passed++; console.log(`  ✓ ${label}`); };

const economy = await loadEconomy();
const FEE = economy.civil.legal_fee;

/** A die that returns a fixed queue of rolls; throws if an unexpected extra roll happens. */
function scriptedDie(rolls) {
  const q = [...rolls];
  return () => {
    if (q.length === 0) throw new Error("scripted die exhausted (unexpected roll)");
    return q.shift();
  };
}

function newGame(names = ["Ana"]) {
  resetIds();
  return new Game(economy, names.map((n, i) => ({ name: n, service: economy.services[i] })), { seed: 1 });
}

// --- Getaway math (Dial 5): one modifier, the Slick Lawyer (±2), clamped 1–5 ---------------
{
  const owed = economy.civil.getaway_owed, dispute = economy.civil.getaway_dispute;
  assert.equal(getawayThreshold(economy, owed), 2, "vendor/owed base → walk on 1–2 (33%)");
  assert.equal(getawayThreshold(economy, dispute), 3, "dispute base → walk on 1–3 (50%)");
  assert.equal(getawayThreshold(economy, owed, 1, 0), 4, "your lawyer +2 → 1–4 (67%)");
  assert.equal(getawayThreshold(economy, owed, 0, 1), 1, "their lawyer −2 → floored to 1-in-6");
  assert.equal(getawayThreshold(economy, dispute, 1, 1), 3, "both lawyers cancel → back to base");
  assert.equal(getawayThreshold(economy, dispute, 2, 0), 5, "stacked lawyers cap at 5 (5/6)");
  ok("getaway math: one Slick Lawyer modifier (±2), clamped to 1–5");
}

// --- AR factoring (fee from economy.factoring_fee) ---------------------------------------
{
  const g = newGame();
  const p = g.currentPlayer;
  p.invoices.push({ id: "I9", amount: 10, source_job: "x", due_turn: 99, factored: false });
  const before = p.cash;
  g.factorInvoice("I9");
  const fee = Math.ceil(10 * economy.factoring_fee);
  assert.equal(p.cash, before + (10 - fee), "factoring pays amount minus the fee");
  assert.equal(p.invoices.length, 0);
  ok(`AR factoring: 10 W invoice → ${10 - fee} W now (${fee} W fee)`);
}

// --- Code violations (Pass 2d): fine + productivity drag + routable fix -------------------
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }, { name: "Eli", service: "electrician" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0], eli = g.state.players[1];
  ana.equipment.push(createEquipment("basic", { owned: true })); // a tool → burn 2, so the drag shows
  ana.jobs.push({
    id: "JD", card: "x", name: "Big tune-up", value: 8, work_amount: 40, work_done: 0, deadline_turn: g.state.turn + 12,
    min_tradesmen: 1, max_tradesmen: 1, required_equipment: null, terms: 1, required_building_tier: 1,
    equipment_per_tradesman: false, droppable: true, required_trade: null, hirer_id: null, state: "Active",
    assigned_tradesmen: [ana.tradesmen[0].id], exposed: false,
  });
  ana.tradesmen[0].assignedJob = "JD";

  runJobProgress(g.state, ana);
  const cleanBurn = ana.jobs[0].work_done; // burns the tool's speed with no defect

  ana.defects.push({ id: "D1", card: "code_violation", name: "Failed inspection", since_turn: g.state.turn, fine: 2, fix_cost: 6, fix_trade: "electrician", fix_terms: 2, productivity_hit: 1 });
  runJobProgress(g.state, ana);
  assert.equal(cleanBurn - (ana.jobs[0].work_done - cleanBurn), 1, "an unfixed defect drags productivity_hit off the burn");

  const cashBefore = ana.cash;
  defects.tickDefects(g.state, ana);
  assert.equal(ana.cash, cashBefore - 2, "an unfixed defect fines you each upkeep");

  g.fixDefect("D1");
  assert.equal(ana.defects.length, 0, "fixing clears the defect (productivity + fine stop)");
  const fixAp = ana.payables.find((a) => a.creditor_id === eli.id);
  assert.ok(fixAp && fixAp.amount === 6 && !fixAp.is_npc, "the fix is booked as a payable to the electrician — their AR");
  ok("code violation: fine + productivity drag, and the fix routes to a tradesperson as an AP");
}

// --- Bankruptcy unwinds the folded shop's AR/AP web --------------------------------------
{
  resetIds();
  const g = new Game(economy, [
    { name: "Folder", service: "plumber" },
    { name: "Hirer", service: "mechanic" },
    { name: "Debtor", service: "welder" },
  ], { seed: 1 });
  g.start();
  const [folder, hirer, debtor] = g.state.players;

  // Hirer routed a big contract TO Folder (Folder holds the job; Hirer holds the pending AP).
  folder.jobs.push({
    id: "JT", card: "x", name: "Big contract", value: 56, work_amount: 24, work_done: 4, deadline_turn: g.state.turn + 8,
    min_tradesmen: 3, max_tradesmen: 4, required_equipment: null, terms: 1, required_building_tier: 1,
    equipment_per_tradesman: false, droppable: true, required_trade: null, hirer_id: hirer.id, state: "Queued",
    assigned_tradesmen: [], exposed: false,
  });
  hirer.payables.push(createPayable({ vendor: "Folder (Big contract)", amount: 56, dueTurn: null, isNpc: false, creditorId: folder.id, jobId: "JT", pending: true }));
  // Debtor owes Folder for a delivered job; and a damages claim names Folder as contractor.
  debtor.payables.push(createPayable({ vendor: "Folder (job)", amount: 8, dueTurn: g.state.turn, isNpc: false, creditorId: folder.id }));
  g.state.pendingDamages.push({ hirerId: hirer.id, contractorId: folder.id, jobId: "old", jobName: "x", value: 5, window: 3 });

  folder.cash = 0; // can't cover overhead → folds at upkeep
  runUpkeep(g.state, folder);
  assert.ok(folder.bankrupt, "Folder folds");
  assert.equal(hirer.payables.filter((a) => a.job_id === "JT").length, 0, "the hirer's dangling 'in progress' contract liability is cleared");
  assert.equal(debtor.payables.filter((a) => a.creditor_id === folder.id).length, 0, "a debt owed to the folded shop is written off");
  assert.equal(g.state.pendingDamages.filter((c) => c.contractorId === folder.id).length, 0, "damages claims against the judgment-proof shop are dropped");
  assert.equal(folder.payables.length + folder.jobs.length + folder.invoices.length, 0, "the folded shop's own books are wiped");
  ok("bankruptcy unwinds the folded shop's AR/AP web — no dangling contracts left behind");
}

// --- Factoring a PLAYER debt → sold to collections (guaranteed lawyer) --------------------
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }, { name: "Boe", service: "plumber" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0], boe = g.state.players[1];
  boe.payables.push(createPayable({ vendor: "Ana (job)", amount: 10, dueTurn: g.state.turn, isNpc: false, creditorId: ana.id, jobId: "j", pending: false }));
  const apId = boe.payables[0].id;
  const before = ana.cash;
  g.factorClaim(apId);
  const fee = Math.ceil(10 * economy.factoring_fee);
  assert.equal(ana.cash, before + (10 - fee), "Ana gets the debt value minus the factoring fee");
  const ap = boe.payables.find((a) => a.id === apId);
  assert.ok(ap.is_npc && ap.collections && ap.agency_lawyer && ap.creditor_id === null, "debt converts to an NPC-style collections bill with a guaranteed lawyer");
  ok(`factoring a player debt: cash now (${10 - fee} W) + the agency takes over collection`);
}

// --- The collections lawyer floors the debtor's getaway in court --------------------------
{
  resetIds();
  const g = new Game(economy, [{ name: "Ana", service: "mechanic" }], { seed: 1 });
  g.start();
  const ana = g.state.players[0];
  ana.payables.push(createPayable({ vendor: "Collections", amount: 10, dueTurn: g.state.turn, isNpc: true }));
  const apId = ana.payables[0].id;
  g.state.die = scriptedDie([2]); // owed base 2 → would WALK (1–2); agency lawyer floors to 1 → LOSES
  const cash0 = ana.cash;
  payables.resolveCourt(g.state, { playerId: ana.id, payableId: apId, vendor: "Collections", amount: 10, agencyLawyer: true }, false, 0);
  assert.equal(ana.cash, cash0 - 10 - FEE, "vs collections (guaranteed lawyer), a 2 that would normally walk now loses");
  ok("collections lawyer: debtor with no lawyer of their own walks only on the minimum roll");
}

// --- Can't get blood from a stone: collection caps at the debtor's cash -------------------
{
  resetIds();
  const g = new Game(economy, [{ name: "Cred", service: "mechanic" }, { name: "Broke", service: "plumber" }], { seed: 1 });
  g.start();
  const cred = g.state.players[0], broke = g.state.players[1];
  broke.cash = 1; // nearly tapped out, owes 9
  broke.payables.push(createPayable({ vendor: "Cred (job)", amount: 9, dueTurn: g.state.turn, isNpc: false, creditorId: cred.id }));
  const ap = broke.payables[0];
  ap.sue_window_remaining = economy.sue_window;
  g.state.die = scriptedDie([5]); // owed base 2 → rolling 5 loses
  const credBefore = cred.cash;
  g.sue(broke.id, ap.id);
  g.respondToThreat({ contest: true });
  // collectible = min(9, 1) = 1; cred nets +1 collected − 1 fee = 0, NOT the full 9.
  assert.equal(cred.cash, credBefore, "creditor collects only the 1 W the debtor had (net 0 after fee), not the full 9");
  assert.equal(broke.payables.length, 0, "the debt is settled — the uncollectible remainder is written off");
  ok("collection caps at the debtor's cash: suing a broke rival nets scraps, not face value");
}

// --- Factoring prices to collectibility (a broke debt sells for scraps) -------------------
{
  resetIds();
  const g = new Game(economy, [{ name: "Seller", service: "mechanic" }, { name: "Skint", service: "plumber" }], { seed: 1 });
  g.start();
  const seller = g.state.players[0], skint = g.state.players[1];
  skint.cash = 1;
  skint.payables.push(createPayable({ vendor: "Seller (job)", amount: 10, dueTurn: g.state.turn, isNpc: false, creditorId: seller.id }));
  const apId = skint.payables[0].id;
  const before = seller.cash;
  g.factorClaim(apId);
  // collectible = min(10, 1) = 1; fee = ceil(1 * 0.2) = 1; proceeds = 0.
  assert.equal(seller.cash, before, "a near-broke rival's debt fetches ~nothing — the agency won't overpay");
  assert.ok(skint.payables.find((a) => a.id === apId).collections, "still handed to collections (effectively a kill order)");
  ok("factoring prices to collectibility, not face value");
}

// --- NPC Demand Roll: dodge, settle, forgive, court --------------------------------------
function npcPayable(turn = 5) {
  const g = newGame();
  g.state.turn = turn;
  const ap = createPayable({ vendor: "Vendor", amount: 6, dueTurn: turn, isNpc: true });
  g.currentPlayer.payables.push(ap);
  return { g, p: g.currentPlayer, ap };
}
{
  const { g, p, ap } = npcPayable();
  g.state.die = scriptedDie([2]); // 1st dodge target 2 → pass
  payables.processDuePayables(g.state, p);
  assert.equal(p.payables.length, 1, "passed Demand Roll → still owed, dodged again");
  assert.equal(ap.turns_dodged, 1);
  ok("Demand Roll pass → dodge again");
}
{
  const { g, p } = npcPayable();
  g.state.die = scriptedDie([6]); // natural 6 → settlement OFFER (player chooses)
  const before = p.cash;
  payables.processDuePayables(g.state, p);
  assert.equal(g.state.pendingSettle.length, 1, "natural 6 → settlement offered, not auto-taken");
  g.resolveSettle(g.state.pendingSettle[0].payableId, { accept: true });
  assert.equal(p.payables.length, 0, "accepted → settled away");
  assert.equal(p.cash, before - Math.ceil(6 * economy.npc_demand.settle_fraction), "paid 50%");
  ok("Demand Roll natural 6 → settlement offer; accepting pays 50%");
}
{
  // Decline keeps the debt (you keep dodging). Available on ANY round (no "forgiven on the 5th").
  const { g, p, ap } = npcPayable();
  ap.turns_dodged = economy.npc_demand.max_dodges - 1; // next dodge is the last
  g.state.die = scriptedDie([6]);
  const before = p.cash;
  payables.processDuePayables(g.state, p);
  g.resolveSettle(g.state.pendingSettle[0].payableId, { accept: false });
  assert.equal(p.payables.length, 1, "declined → debt stands, keeps dodging");
  assert.equal(p.cash, before, "no payment on decline");
  ok("Demand Roll natural 6 offer (any round); declining keeps the debt");
}
{
  const FEE = economy.civil.legal_fee;
  const { g, p } = npcPayable();
  g.state.die = scriptedDie([1, 2]); // demand fail (1), then court rolls 2 ≤ getaway_owed(2) → WALK
  const before = p.cash;
  payables.processDuePayables(g.state, p);
  assert.equal(g.state.pendingCourt.length, 1, "demand fail → summoned to court (deferred)");
  g.resolveCourt(g.state.pendingCourt[0].payableId, { lawyer: false });
  assert.equal(p.payables.length, 0, "debt wiped");
  assert.equal(p.cash, before - FEE, "walk on 1–2 → debt wiped, just the legal fee");
  ok("NPC court: base 1–2 walk (33%) → debt wiped, 1 W fee");
}
{
  const FEE = economy.civil.legal_fee;
  const { g, p } = npcPayable();
  g.state.die = scriptedDie([1, 3]); // demand fail, court rolls 3 > 2 → LOSE
  const before = p.cash;
  payables.processDuePayables(g.state, p);
  g.resolveCourt(g.state.pendingCourt[0].payableId, { lawyer: false });
  assert.equal(p.cash, before - (6 + FEE), "lose → pay the bill + the legal fee");
  ok("NPC court: roll above the line → pay amount + fee");
}
{
  // The fix: a Slick Lawyer (+2) turns a court loss into a walk.
  const FEE = economy.civil.legal_fee;
  const { g, p } = npcPayable();
  p.hand.push({ id: "sl", type: "slick_lawyer", name: "Slick Lawyer" });
  g.state.die = scriptedDie([1, 3]); // court rolls 3: loses at ≤2, WALKS at ≤4 (with lawyer)
  const before = p.cash;
  payables.processDuePayables(g.state, p);
  g.resolveCourt(g.state.pendingCourt[0].payableId, { lawyer: true });
  assert.equal(p.hand.length, 0, "the Slick Lawyer was consumed");
  assert.equal(p.payables.length, 0, "debt wiped");
  assert.equal(p.cash, before - FEE, "lawyer pushed the line to 1–4 → walked");
  ok("NPC court: a Slick Lawyer (+2 → 1–4) wins a case you'd have lost");
}
{
  // And the table can pile on for the accuser: 1 lawyer against drops you back to a 1-in-6 walk.
  const { g, p } = npcPayable();
  g.state.die = scriptedDie([1, 2]); // court rolls 2: walks at base 1–2, but loses if the line is 1–0→clamped 1
  payables.processDuePayables(g.state, p);
  const before = p.cash;
  g.resolveCourt(g.state.pendingCourt[0].payableId, { lawyer: false, accuserLawyers: 1 });
  assert.equal(p.cash, before - (6 + economy.civil.legal_fee), "accuser's lawyer floored you to 1-in-6 → lost");
  ok("NPC court: an accuser-side lawyer floors your walk odds at 1-in-6");
}

// --- Player sue window: opens, ticks down, forgiven if unsued -----------------------------
{
  const g = newGame(["Ana", "Bo"]);
  const debtor = g.state.players[1];
  const ap = createPayable({ vendor: "Ana", amount: 5, dueTurn: 1, isNpc: false, creditorId: g.state.players[0].id });
  debtor.payables.push(ap);
  g.state.turn = 2; // overdue
  payables.processDuePayables(g.state, debtor);
  assert.equal(ap.sue_window_remaining, economy.sue_window, "sue window opens at full length");
  let guard = 0;
  while (debtor.payables.length && guard++ < 10) { g.state.turn++; payables.processDuePayables(g.state, debtor); }
  assert.equal(debtor.payables.length, 0, "unsued within the window → debt forgiven");
  ok("player sue window opens, ticks down, forgives if unsued");
}

// --- sue(): the player-vs-player civil resolver ------------------------------------------
function suableGame() {
  const g = newGame(["Ana", "Bo"]); // Ana (creditor) is current player
  const creditor = g.state.players[0];
  const debtor = g.state.players[1];
  const ap = createPayable({ vendor: "Ana", amount: 5, dueTurn: 1, isNpc: false, creditorId: creditor.id });
  ap.sue_window_remaining = economy.sue_window;
  debtor.payables.push(ap);
  return { g, creditor, debtor, ap };
}
{
  // Dispute base 3 (walk on 1–3). Roll 4 → debtor loses → creditor collects; 1 W fee each.
  const { g, creditor, debtor } = suableGame();
  const c0 = creditor.cash, d0 = debtor.cash;
  g.sue(debtor.id, debtor.payables[0].id);
  g.state.die = scriptedDie([4]);
  g.respondToThreat({ contest: true });
  assert.equal(creditor.cash, c0 - FEE + 5, "creditor collects the 5 W debt, less the fee");
  assert.equal(debtor.cash, d0 - FEE - 5, "debtor pays the debt + the fee");
  assert.equal(debtor.payables.length, 0, "debt collected");
  ok("sue: defendant rolls above the line → creditor WINS, collects the debt");
}
{
  // Roll 2 ≤ 3 → debtor WALKS; debt stands; 1 W fee each.
  const { g, creditor, debtor } = suableGame();
  const c0 = creditor.cash, d0 = debtor.cash;
  g.sue(debtor.id, debtor.payables[0].id);
  g.state.die = scriptedDie([2]);
  g.respondToThreat({ contest: true });
  assert.equal(creditor.cash, c0 - FEE, "creditor just pays the fee");
  assert.equal(debtor.cash, d0 - FEE, "debtor walks, pays only the fee");
  assert.equal(debtor.payables.length, 1, "debt stands; window keeps ticking");
  ok("sue: defendant walks → debt stands, fee each");
}
{
  // Debtor plays a Slick Lawyer (+2 → 1–5): a roll of 4 now walks where it'd otherwise lose.
  const { g, creditor, debtor } = suableGame();
  debtor.hand.push({ id: "sl", type: "slick_lawyer", name: "Slick Lawyer" });
  g.sue(debtor.id, debtor.payables[0].id);
  g.state.die = scriptedDie([4]);
  g.respondToThreat({ contest: true, ownLawyer: true });
  assert.equal(debtor.hand.length, 0, "the Slick Lawyer was consumed");
  assert.equal(debtor.payables.length, 1, "lawyer pushed the line to 1–5 → walked, debt stands");
  ok("sue: a Slick Lawyer (+2) lets the debtor walk a case they'd have lost");
}
{
  const { g, creditor, debtor } = suableGame();
  const c0 = creditor.cash, d0 = debtor.cash;
  g.sue(debtor.id, debtor.payables[0].id);
  g.respondToThreat({ contest: false }); // fold — no roll, no fee
  assert.equal(creditor.cash, c0 + 5, "creditor collects the debt");
  assert.equal(debtor.cash, d0 - 5, "debtor pays, no fight");
  ok("sue: fold → debtor pays, no roll");
}

// --- Sabotage → Rush response window ------------------------------------------------------
function sabotageGame() {
  const g = newGame(["Ana", "Bo"]);
  const attacker = g.state.players[0];
  const owner = g.state.players[1];
  attacker.hand.push({ id: "sab", type: "sabotage", counterable_by: ["rush"] });
  owner.jobs.push({ id: "J9", name: "Job", work_amount: 10, work_done: 0, deadline_turn: 8, state: "Active", assigned_tradesmen: [], min_tradesmen: 1, max_tradesmen: 1, required_equipment: null, droppable: true, exposed: false });
  return { g, attacker, owner, job: owner.jobs[0] };
}
{
  const { g, owner, job } = sabotageGame();
  owner.hand.push({ id: "r", type: "rush" });
  g.playSabotage("J9");
  assert.ok(g.state.pendingThreat, "threat opened");
  g.respondToThreat({ counter: true });
  assert.equal(job.deadline_turn, 8, "Rush counters — deadline untouched");
  assert.equal(owner.hand.length, 0, "Rush consumed");
  assert.equal(g.state.pendingThreat, null);
  ok("Sabotage countered by Rush → negated");
}
{
  const { g, job } = sabotageGame();
  g.playSabotage("J9");
  g.respondToThreat({ counter: false }); // let it land
  assert.equal(job.deadline_turn, 8 - economy.cards.sabotage_delay, "Sabotage pulls the deadline in");
  ok("Sabotage lands → deadline shrinks");
}

// --- Buy Time -----------------------------------------------------------------------------
{
  const g = newGame();
  const p = g.currentPlayer;
  p.hand.push({ id: "bt", type: "buy_time" });
  p.jobs.push({ id: "J1", name: "Job", deadline_turn: 5, state: "Active", assigned_tradesmen: [], work_amount: 5, work_done: 0, min_tradesmen: 1, max_tradesmen: 1, required_equipment: null, droppable: true, exposed: false });
  g.playBuyTime("J1");
  assert.equal(p.jobs[0].deadline_turn, 5 + economy.cards.buy_time_turns, "Buy Time extends a job deadline");
  assert.equal(p.hand.length, 0, "Buy Time consumed");
  ok("Buy Time extends a deadline");
}

// --- Class Action force-settles all AP ----------------------------------------------------
{
  const g = newGame(["Ana", "Bo"]);
  g.state.players[0].payables.push(createPayable({ vendor: "V1", amount: 4, dueTurn: 9, isNpc: true }));
  g.state.players[1].payables.push(createPayable({ vendor: "V2", amount: 7, dueTurn: 9, isNpc: true }));
  const c0 = g.state.players[0].cash, c1 = g.state.players[1].cash;
  payables.classAction(g.state);
  assert.equal(g.state.players[0].cash, c0 - 4);
  assert.equal(g.state.players[1].cash, c1 - 7);
  assert.ok(g.state.players.every((p) => p.payables.length === 0), "all AP settled");
  ok("Class Action force-settles every player's AP at full value");
}

// --- Trade-routed player-to-player jobs ---------------------------------------------------
import { drawFortune } from "../src/engine/fortune.js";
import * as jobs from "../src/engine/jobs.js";

const routedCard = { type: "job", id: "plumb", name: "Plumbing job", value: 10, work_amount: 6, deadline: 4, min_tradesmen: 1, max_tradesmen: 2, required_equipment: null, droppable: true, required_trade: "plumber" };
function routedGame() {
  resetIds();
  const g = new Game(economy, [{ name: "Hirer", service: "mechanic" }, { name: "Plumber", service: "plumber" }], { seed: 1, fortune: [routedCard] });
  return { g, hirer: g.state.players[0], plumber: g.state.players[1] };
}

{
  // The mechanic draws a plumbing job → routes to the plumber; hirer gets a pending AP.
  const { g, hirer, plumber } = routedGame();
  const [drawn] = drawFortune(g.state, hirer, 1);
  assert.equal(hirer.jobs.length, 0, "hirer doesn't keep a job they can't do");
  assert.equal(plumber.jobs.length, 1, "the plumber gets the job");
  assert.equal(drawn.job.hirer_id, hirer.id, "job tagged with the hirer");
  assert.equal(hirer.payables.length, 1, "hirer holds a pending AP for the value");
  assert.ok(hirer.payables[0].pending && hirer.payables[0].creditor_id === plumber.id && hirer.payables[0].amount === 10);
  ok("trade-routed: a job you can't do routes to the player who can; you owe the value");
}
{
  // Completion: the AP comes due (no NPC invoice); the hirer pays → the plumber is paid.
  const { g, hirer, plumber } = routedGame();
  const [drawn] = drawFortune(g.state, hirer, 1);
  const job = drawn.job;
  jobs.assign(g.state, plumber, job.id);
  job.work_done = 5;
  jobs.runJobProgress(g.state, plumber);
  assert.equal(plumber.invoices.length, 0, "contractor gets no NPC invoice — the hirer pays");
  const ap = hirer.payables[0];
  assert.equal(ap.pending, false, "the AP is now due");
  const p0 = plumber.cash;
  payables.payPayable(g.state, hirer, ap.id);
  assert.equal(plumber.cash, p0 + 10, "paying the AP pays the plumber the contract value");
  ok("trade-routed completion: the hirer's AP comes due; paying it pays the contractor");
}
{
  // Botch: the contractor fails it → hirer's liability CLEARS + a damages claim opens.
  const { g, hirer, plumber } = routedGame();
  const [drawn] = drawFortune(g.state, hirer, 1);
  const job = drawn.job;
  g.state.turn = job.deadline_turn + 1; // overdue
  jobs.expireOverdue(g.state, plumber);
  assert.equal(hirer.payables.length, 0, "hirer's liability cleared — no delivery, no debt");
  assert.equal(g.state.pendingDamages.length, 1, "a damages claim opened");
  assert.equal(g.state.pendingDamages[0].hirerId, hirer.id);
  ok("trade-routed botch: hirer's liability clears + opens a damages claim");
}
{
  // The damages suit: hirer sues → contractor pays the BANK (hirer doesn't pocket it).
  const { g, hirer, plumber } = routedGame();
  const [drawn] = drawFortune(g.state, hirer, 1);
  g.state.turn = drawn.job.deadline_turn + 1;
  jobs.expireOverdue(g.state, plumber);
  // hirer is player 0 (current). Sue, plumber defends without a lawyer, roll above the line → loses.
  g.sue; // (no-op ref)
  g.state.die = scriptedDie([4]); // dispute base 3 → roll 4 > 3 → contractor LOSES
  const p0 = plumber.cash, h0 = hirer.cash;
  g.sueDamages(drawn.job.id);
  g.respondToThreat({ contest: true });
  assert.equal(plumber.cash, p0 - 10 - FEE, "contractor pays 10 damages to the bank + the fee");
  assert.equal(hirer.cash, h0 - FEE, "hirer pays only the fee — doesn't pocket the damages");
  ok("trade-routed damages: contractor pays the BANK; the hirer just sinks a rival");
}
{
  // Fallback: nobody at the table has the trade → the drawer does it themselves.
  resetIds();
  const g = new Game(economy, [{ name: "Solo", service: "mechanic" }], { seed: 1, fortune: [routedCard] });
  const p = g.currentPlayer;
  const [drawn] = drawFortune(g.state, p, 1);
  assert.equal(drawn.job.hirer_id, null, "not routed");
  assert.equal(p.jobs.length, 1, "the drawer keeps it as their own job");
  assert.equal(p.payables.length, 0, "no AP");
  ok("trade-routed fallback: no trade-holder → the drawer does the job");
}

// --- The Final Reckoning -----------------------------------------------------------------
{
  // Drive a 2-player game to year-end and confirm the reckoning opens in standings order.
  resetIds();
  const econ = { ...economy, max_turns: 2 };
  const g = new Game(econ, [{ name: "Rich", service: "welder" }, { name: "Poor", service: "plumber" }], { seed: 1 });
  g.state.players[0].cash = 100;
  g.state.players[1].cash = 10;
  let ctx = g.start();
  let safety = 0;
  while (!ctx.over && !ctx.reckoning && safety++ < 50) ctx = g.endTurn();
  assert.ok(ctx.reckoning, "year-end opens the Final Reckoning (survivors present)");
  assert.deepEqual(ctx.order.map((id) => g.state.players.find((p) => p.id === id).name), ["Poor", "Rich"], "Last Licks run trailing-player-first");
  ok("Final Reckoning opens in standings order (trailing first)");
}
{
  // closeBooks collects ALL receivables in full; leaves AP untouched; crowns the most cash.
  resetIds();
  const econ = { ...economy, max_turns: 2 };
  const g = new Game(econ, [{ name: "Ana", service: "mechanic" }, { name: "Bo", service: "plumber" }], { seed: 1 });
  let ctx = g.start();
  let safety = 0;
  while (!ctx.over && !ctx.reckoning && safety++ < 50) ctx = g.endTurn();
  const ana = g.state.players[0];
  ana.invoices.push({ id: "I1", amount: 9, source_job: "x", due_turn: 999, factored: false });
  ana.payables.push(createPayable({ vendor: "Vendor", amount: 7, dueTurn: 999, isNpc: true }));
  const cashBefore = ana.cash;
  const apBefore = ana.payables.length;
  const final = g.closeBooks();
  assert.equal(ana.cash, cashBefore + 9, "all receivables collect in full at year-end (NPC always pays)");
  assert.equal(ana.invoices.length, 0, "AR cleared");
  assert.equal(ana.payables.length, apBefore, "AP is NOT force-settled — stiffing vendors is a strategy");
  assert.ok(final.over && final.results, "books close and standings are produced");
  ok("closeBooks: AR collects in full, AP untouched, winner is the most cash");
}
{
  // Reckoning sabotage buries a rival's ROUTED job → opens a damages claim for the hirer.
  resetIds();
  const econ = { ...economy, max_turns: 1 };
  const g = new Game(econ, [{ name: "Hirer", service: "welder" }, { name: "Rival", service: "plumber" }], { seed: 1 });
  const hirer = g.state.players[0];
  const rival = g.state.players[1];
  hirer.hand.push({ id: "sab", type: "sabotage", counterable_by: ["rush"] });
  // Rival is mid-way through a routed job the Hirer commissioned.
  rival.jobs.push({ id: "JF", name: "Plumbing job", value: 10, work_amount: 10, work_done: 4, deadline_turn: 9, state: "Active", assigned_tradesmen: [], min_tradesmen: 1, max_tradesmen: 2, required_equipment: null, required_building_tier: 1, equipment_per_tradesman: false, droppable: true, required_trade: "plumber", hirer_id: hirer.id, exposed: false });
  hirer.payables.push(createPayable({ vendor: "Rival", amount: 10, dueTurn: null, isNpc: false, creditorId: rival.id, jobId: "JF", pending: true }));
  let ctx = g.start();
  let safety = 0;
  while (!ctx.over && !ctx.reckoning && safety++ < 50) ctx = g.endTurn();
  assert.ok(ctx.reckoning, "reached the reckoning");
  g.seatReckoning(hirer.id);
  g.playSabotage("JF");
  g.respondToThreat({ counter: false }); // Rival has no Rush
  assert.ok(!rival.jobs.some((j) => j.id === "JF"), "the routed job is buried");
  assert.equal(hirer.payables.length, 0, "hirer's liability cleared");
  assert.ok(g.state.pendingDamages.some((c) => c.jobId === "JF" && c.hirerId === hirer.id), "a damages claim opened");
  ok("Reckoning Sabotage buries a rival's routed job → liability clears + damages claim");
}
{
  // A reckoning action that isn't a final play (e.g. hire) is refused.
  resetIds();
  const econ = { ...economy, max_turns: 1 };
  const g = new Game(econ, [{ name: "Ana", service: "mechanic" }, { name: "Bo", service: "plumber" }], { seed: 1 });
  let ctx = g.start();
  let safety = 0;
  while (!ctx.over && !ctx.reckoning && safety++ < 50) ctx = g.endTurn();
  g.seatReckoning(g.state.players[0].id);
  assert.throws(() => g.hire(), /year is over/i);
  ok("Reckoning refuses non-final actions (no hiring once the year is up)");
}

console.log(`\nAll Stage 4 smoke checks passed (${passed}).`);
