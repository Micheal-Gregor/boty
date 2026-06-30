// Bankruptcy wind-down: when a shop folds, the bank/steward closes the estate so NOTHING dangles and
// no rival catches a break (a fold mustn't be a free escape hatch for the rest of the table).
//   1. Forced folds in real bot games — after a fold, no surviving player still references the folded
//      shop (a job's hirer_id, an accrued payable's creditor_id), no pending lawsuit/civic/project points
//      at it, its own books are wiped, and every survivor's books still balance.
//   2. A focused civic-slot + both-lawsuit-roles scenario driven through the real runUpkeep fold path.
import assert from "node:assert/strict";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { balanceSheet } from "../src/state/ledger.js";
import { runUpkeep } from "../src/engine/turn.js";
import { botActions } from "../tools/bot.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const economy = await loadEconomy();
const decks = await loadDecks();

function assertNothingDangles(state, f) {
  for (const p of state.players) {
    if (p === f) continue;
    assert.equal(p.jobs.some((j) => j.hirer_id === f.id), false, `${p.name} still has a job for folded ${f.name}`);
    assert.equal(p.payables.some((a) => a.accrued && a.creditor_id === f.id), false, `${p.name} still owes folded ${f.name} (uncollected — a free pass)`);
  }
  assert.equal(state.pendingDamages.some((c) => [c.contractorId, c.recipientId, c.hirerId].includes(f.id)), false, `a lawsuit still references folded ${f.name}`);
  assert.equal((state.civics ?? []).some((cv) => cv.contracts.some((c) => c.player_id === f.id && !c.done)), false, `a civic slot is still open for folded ${f.name}`);
  assert.equal((state.projects ?? []).some((pr) => pr.leadId === f.id || pr.phases.some((ph) => ph.subId === f.id && !ph.done)), false, `a project still depends on folded ${f.name}`);
  assert.equal(f.payables.length + f.jobs.length + f.invoices.length, 0, `folded ${f.name}'s own books were not wiped`);
}

// 1. Forced folds in real games -------------------------------------------------------------------
let folds = 0;
for (const [seed, diff] of [[7, "cutthroat"], [19, "cutthroat"], [42, "standard"]]) {
  resetIds();
  const g = new Game(economy, [
    { name: "A", service: "mechanic" }, { name: "B", service: "plumber" },
    { name: "C", service: "electrician" }, { name: "D", service: "carpenter" },
  ], { ...decks, seed, difficulty: diff });
  g.start();
  let victim = null;
  for (let i = 0; i < 120 && !g.state.over; i++) {
    if (!victim && i === 30) victim = g.state.players.find((p) => !p.bankrupt); // doom one mid-game, after entanglements built up
    if (victim && !victim.bankrupt) victim.cash = -100000;                      // can't cover upkeep → folds on their next turn
    try { botActions(g, "balanced"); } catch { /* best effort */ }
    g.autoResolveCourt?.(); g.autoResolveSettle?.(); g.autoResolvePoach?.(); g.autoResolveMayor?.(); g.autoResolveReferral?.(); g.autoResolveDamages?.();
    g.endTurn();
    for (const f of g.state.players) { if (f.bankrupt) { assertNothingDangles(g.state, f); folds++; } }
    for (const p of g.state.players) if (!p.bankrupt) assert.ok(balanceSheet(p).balanced, `${p.name}'s books unbalanced after a fold (${diff}/${seed})`);
  }
}
assert.ok(folds > 0, "expected at least one fold to exercise the wind-down");
console.log("  ✓ forced folds across 3 games — estate fully closed, nothing dangles, survivors' books balance");

// 2. Focused: civic slot + both lawsuit roles, resolved through the real fold path -----------------
resetIds();
{
  const g = new Game(economy, [
    { name: "A", service: "mechanic" }, { name: "B", service: "plumber" }, { name: "C", service: "electrician" },
  ], { ...decks, seed: 5, difficulty: "standard" });
  g.start();
  const [A, B, C] = g.state.players;
  // A is the defendant in B's suit; A is the plaintiff in a suit against C.
  g.state.pendingDamages.push({ hirerId: B.id, contractorId: A.id, jobId: "suitB", jobName: "Botched reno", value: 12, recipientId: B.id });
  g.state.pendingDamages.push({ hirerId: A.id, contractorId: C.id, jobId: "suitC", jobName: "C's botch", value: 6, recipientId: A.id });
  // A civic whose ONLY open slot is A's; PM is B. Once the county covers A's slot it delivers in full.
  g.state.civics = [{
    id: "civ1", name: "Town Hall", pm_id: B.id, deadline_turn: 99, favor_reward: 1, global_penalty: { kind: "levy", amount: 1 },
    contracts: [
      { player_id: A.id, job_id: "cjA", value: 10, done: false },
      { player_id: B.id, job_id: "cjB", value: 10, done: true },
      { player_id: C.id, job_id: "cjC", value: 10, done: true },
    ],
  }];
  const bHandBefore = B.hand.length;

  A.cash = -100000;
  runUpkeep(g.state, A);

  assert.ok(A.bankrupt, "A folded");
  assert.equal(g.state.pendingDamages.length, 0, "both suits moved off pendingDamages");
  assert.equal(g.state.estateClaims.length, 2, "both suits were handed to the bank as estate claims");
  const bClaim = g.state.estateClaims.find((c) => c.partyId === B.id);
  const cClaim = g.state.estateClaims.find((c) => c.partyId === C.id);
  assert.ok(bClaim && !bClaim.owes, "B (the plaintiff) is OWED by the estate");
  assert.ok(cClaim && cClaim.owes, "C (the defendant) OWES the estate");
  assert.equal(g.state.civics.length, 0, "the civic completed once the county covered A's slot — no town penalty");
  assert.ok(B.hand.length > bHandBefore, "PM B earned the civic favour on full delivery");
  assert.equal(A.payables.length + A.jobs.length + A.invoices.length, 0, "A's own books were wiped");
  assert.ok(balanceSheet(B).balanced && balanceSheet(C).balanced, "survivors' books still balance after the wind-down");
  console.log("  ✓ focused: civic county-covered & completed, both lawsuits → estate claims, A wound up cleanly");
}

// 3. Estate-claim resolution: settle (50%) vs refuse → court (full / nothing + fee) -----------------
resetIds();
{
  const g = new Game(economy, [
    { name: "A", service: "mechanic" }, { name: "B", service: "plumber" }, { name: "C", service: "electrician" },
  ], { ...decks, seed: 9, difficulty: "standard" });
  g.start();
  const [, B, C] = g.state.players;
  const fee = g.state.economy.civil.legal_fee;
  g.state.estateClaims = [
    { id: "e1", fromName: "Acme", jobName: "Reno", value: 12, partyId: B.id, owes: true, settle: 6 },  // B owes the estate
    { id: "e2", fromName: "Acme", jobName: "Wiring", value: 8, partyId: C.id, owes: false, settle: 4 }, // estate owes C
  ];
  // B settles → pays the bank 50%.
  g.state.activePlayerIndex = g.state.players.indexOf(B);
  const bCash = B.cash;
  g.settleEstateClaim("e1");
  assert.equal(B.cash, bCash - 6, "B paid the 50% estate settlement to the bank");
  assert.ok(balanceSheet(B).balanced, "B's books balance after settling");
  // C refuses → court, forced roll 6 (claim stands) → wins the full value, less the fee.
  g.state.activePlayerIndex = g.state.players.indexOf(C);
  const cCash = C.cash;
  const res = g.courtEstateClaim("e2", { roll: 6 });
  assert.ok(res.full, "roll 6 → the claim stands in full");
  assert.equal(C.cash, cCash + 8 - fee, "C won the full 8 W, less the 1 W court fee");
  assert.ok(balanceSheet(C).balanced, "C's books balance after court");
  assert.equal(g.state.estateClaims.length, 0, "both estate claims resolved");
  // And the losing-roll branch pays nothing but the fee.
  g.state.estateClaims = [{ id: "e3", fromName: "Acme", jobName: "Panel", value: 10, partyId: C.id, owes: false, settle: 5 }];
  const cCash2 = C.cash;
  const res2 = g.courtEstateClaim("e3", { roll: 2 });
  assert.ok(!res2.full, "roll 2 → claim dismissed");
  assert.equal(C.cash, cCash2 - fee, "dismissed: C gets nothing, pays only the fee");
  console.log("  ✓ estate claims: settle pays 50%; refuse→court wins all (roll 6) or nothing (roll 2), fee either way");
}

// 4. A live damages suit CAN bankrupt a rival: the loser owes the full award (driven negative → folds at
//    upkeep), but the plaintiff recovers only what the loser could cover — no money is created. ----------
resetIds();
{
  const g = new Game(economy, [{ name: "P", service: "mechanic" }, { name: "D", service: "plumber" }], { ...decks, seed: 7 });
  g.start();
  const [P, D] = g.state.players;
  D.cash = 3; // nearly broke
  const pBefore = P.cash;
  g.state.pendingThreat = { type: "damages", jobId: "J1", hirerId: P.id, contractorId: D.id, value: 10, jobName: "Reno", recipientId: P.id, accuserLawyers: 0, counterableBy: ["slick_lawyer"] };
  g.respondToThreat({ contest: false }); // D concedes
  assert.equal(P.cash - pBefore, 3, "plaintiff recovers only the 3 the loser could cover (no money creation)");
  assert.ok(D.cash < 0, "the full award drove the loser negative — they fold at the next upkeep");
  assert.ok(balanceSheet(P).balanced && balanceSheet(D).balanced, "both books still balance");
  console.log("  ✓ a suit can bankrupt: full award drives the loser under; plaintiff recovers only what's available");
}
console.log("All bankruptcy wind-down checks passed.");
