// Game orchestrator — the single API surface the UI talks to. It owns the state, runs the
// phases in order, and routes action calls to shop.js for the *current* player only. The UI
// never mutates state directly; it asks the Game, and the Game enforces the rules.

import { createGame, createPayable } from "../state/state.js";
import { cashIn, cashOut, ACCT } from "../state/ledger.js";
import { GameError } from "./economy.js";
import * as shop from "./shop.js";
import * as jobs from "./jobs.js";
import * as cards from "./cards.js";
import * as payables from "./payables.js";
import * as defects from "./defects.js";
import * as modifiers from "./modifiers.js";
import * as expansion from "./expansion.js";
import * as employment from "./employment.js";
import { drawFortune } from "./fortune.js";
import { injectById, pullJobs, womFires } from "./livingdeck.js";
import { getawayThreshold, rollGetaway, getawayOdds } from "./litigation.js";
import { w } from "./economy.js";
import { runUpkeep, advance, results } from "./turn.js";

export class Game {
  constructor(economy, playerSeeds, options = {}) {
    this.state = createGame(economy, playerSeeds, options);
  }

  /** Draw power ramps with crew: +1 card per 2 staff — 1 (1–2 staff), 2 (3–4), 3 (5–6), 4 (7+),
   *  capped at draw_cap. The 4th card needs a maxed shop (warehouse + a BBB capacity upgrade). */
  drawPowerFor(player) {
    const cap = this.state.economy.draw_cap ?? 4;
    return Math.max(1, Math.min(cap, Math.floor((player.tradesmen.length + 1) / 2)));
  }

  get currentPlayer() {
    return this.state.players[this.state.activePlayerIndex];
  }

  get isOver() {
    return this.state.over;
  }

  /** Begin the first player's turn: run their upkeep. Returns the turn context. */
  start() {
    return this.#beginTurn(this.currentPlayer);
  }

  /**
   * Phase 4 — burn work on the current player's active jobs and complete those that finish.
   * Skipped if the player is bankrupt or relocated this turn (relocating costs the turn, so
   * no jobs progress). Returns the progress log lines.
   */
  runProgress() {
    if (this.state.over) return [];
    if (this.state.pendingSettle.length) throw new GameError("Answer the settlement offer first");
    if (this.state.pendingPoach.length) throw new GameError("Answer the poaching offer first");
    if (this.state.pendingMayor.length) throw new GameError("Answer the Mayor's drive first");
    if (this.state.pendingCourt.length) throw new GameError("Resolve your court case first");
    if (this.state.pendingThreat) throw new GameError("Resolve the pending response window first");
    const player = this.currentPlayer;
    if (player.bankrupt || player.relocatedThisTurn) return [];
    const lines = jobs.runJobProgress(this.state, player);
    this.state.log.push(...lines);
    return lines;
  }

  /** Phase 5 — advance to the next solvent player and run their upkeep + draw. */
  advanceTurn() {
    const next = advance(this.state);
    if (next) return this.#beginTurn(next.player);
    // The year is up (advance set over). If everyone's bankrupt, it's truly over; otherwise
    // open the Final Reckoning — a last litigation round before the books close.
    if (this.state.players.every((p) => p.bankrupt)) {
      return { over: true, results: results(this.state) };
    }
    this.state.over = false;
    this.state.phase = "reckoning";
    return { reckoning: true, order: this.reckoningOrder() };
  }

  // --- The Final Reckoning (end of round max_turns) --------------------------------------

  /** Solvent players in standings order for Last Licks: trailing player first, leader last. */
  reckoningOrder() {
    return this.state.players
      .filter((p) => !p.bankrupt)
      .sort((a, b) => a.cash - b.cash)
      .map((p) => p.id);
  }

  /** Seat a player for their Last Licks window (so the action methods target them). */
  seatReckoning(playerId) {
    if (this.state.phase !== "reckoning") throw new GameError("Not in the Final Reckoning");
    const idx = this.state.players.findIndex((p) => p.id === playerId && !p.bankrupt);
    if (idx < 0) throw new GameError(`No solvent player "${playerId}"`);
    this.state.activePlayerIndex = idx;
    return this.state.players[idx];
  }

  /**
   * Close the books: collect ALL receivables in full (NPC customers always pay; the year-end
   * settles them regardless of terms). AP is deliberately NOT force-settled — stiffing a
   * vendor and outrunning the clock is a legitimate strategy. Then crown the most cash.
   */
  closeBooks() {
    const lines = ["— The books close. Receivables settle in full —"];
    for (const p of this.state.players) {
      const total = p.invoices.reduce((s, i) => s + i.amount, 0);
      if (total > 0) { lines.push(`  ${p.name} collects ${w(total)} in receivables`); cashIn(this.state, p, ACCT.AR, total, "Year-end receivables"); }
      p.invoices = [];
      const settled = modifiers.forceSettleCredit(this.state, p); // borrowed money can't win
      if (settled) lines.push(`  ${settled}`);
    }
    this.state.log.push(...lines);
    this.state.over = true;
    this.state.phase = "done";
    return { over: true, results: results(this.state), lines };
  }

  /** Convenience: run job progress for the current player, then advance. */
  /** Chief Boon's job(s) the current player must still staff (mandatory). The web blocks end-turn
   *  on these; bots prioritise them. */
  get unstaffedBoon() {
    return this.currentPlayer.jobs.filter((j) => j.npc === "boon" && j.assigned_tradesmen.length === 0 && ["Queued", "OnHold"].includes(j.state));
  }

  endTurn() {
    const p = this.currentPlayer;
    if (this.state.pendingReferral.some((r) => r.contractor_id === p.id)) throw new GameError("Answer the referral offer first");
    // Bad word of mouth: a Hettrick/Lundgren job drawn THIS round and left unworked pulls jobs from
    // the deck. (Checked once, the round it's drawn.)
    for (const j of p.jobs) {
      if ((j.npc === "hettrick" || j.npc === "lundgren") && j.drawn_turn === this.state.turn && j.assigned_tradesmen.length === 0 && !j.wom_done) {
        j.wom_done = true;
        if (womFires(this.state, j.npc)) pullJobs(this.state, p, this.state.economy.bad_wom_pull ?? 2, `${j.name} left waiting — bad word gets around`);
      }
    }
    this.runProgress();
    // CLEANUP phase: this player's in-play cards that hit their hard deadline leave play → discard.
    this.state.log.push(...jobs.expireOverdue(this.state, p));
    return this.advanceTurn();
  }

  #beginTurn(player) {
    const cashBefore = player.cash;
    const upkeep = runUpkeep(this.state, player);
    const upkeepNet = player.cash - cashBefore; // net of collections in − bills/levies/overhead out
    this.state.log.push(...upkeep.lines);
    const canAct = !player.bankrupt;
    const drawn = canAct ? drawFortune(this.state, player, this.drawPowerFor(player)) : [];
    for (const d of drawn) this.state.log.push(`${player.name} drew ${d.name}: ${d.text}`);
    return {
      over: false,
      turn: this.state.turn,
      player,
      upkeep,
      upkeepNet,
      drawn,
      canAct, // a bankrupt player has no action phase
      court: [...this.state.pendingCourt], // NPC court cases to resolve before acting
      settle: [...this.state.pendingSettle], // natural-6 settlement offers to answer
    };
  }

  // --- Action phase: each delegates to shop.js for the current player, logs, and guards. ---

  #act(fn, finalLegal = false) {
    if (this.state.over) throw new GameError("The game is over");
    if (this.state.pendingSettle.length) throw new GameError("Answer the settlement offer first");
    if (this.state.pendingPoach.length) throw new GameError("Answer the poaching offer first");
    if (this.state.pendingMayor.length) throw new GameError("Answer the Mayor's drive first");
    if (this.state.pendingCourt.length) throw new GameError("Resolve your court case first");
    if (this.state.pendingThreat) throw new GameError("Resolve the pending response window first");
    if (this.state.phase === "reckoning" && !finalLegal) {
      throw new GameError("The year is over — only final plays (rush / sabotage / buy-time / pay / factor / sue) are allowed");
    }
    const player = this.currentPlayer;
    if (player.bankrupt) throw new GameError(`${player.name} is bankrupt and cannot act`);
    if (player.relocatedThisTurn) throw new GameError(`${player.name} relocated this turn — no further actions`);
    const msg = fn(player);
    this.state.log.push(msg);
    return msg;
  }

  #playerById(id) {
    const p = this.state.players.find((x) => x.id === id);
    if (!p) throw new GameError(`No player "${id}"`);
    return p;
  }

  #findJobAnywhere(jobId) {
    for (const owner of this.state.players) {
      const job = owner.jobs.find((j) => j.id === jobId);
      if (job) return { owner, job };
    }
    throw new GameError(`No job "${jobId}" on the table`);
  }

  hire() { return this.#act((p) => shop.hire(this.state, p)); }
  fire(tradesmanId, opts = {}) {
    return this.#act((p) => {
      let ownLawyer = false;
      if (opts.ownLawyer && cards.hasCardType(p, "slick_lawyer")) { cards.takeFromHand(p, cards.findHandCard(p, "slick_lawyer").index); ownLawyer = true; }
      return employment.fireWorker(this.state, p, tradesmanId, { ownLawyer, rolls: opts.rolls ?? null });
    });
  }
  buyEquipment(defId) { return this.#act((p) => shop.buyEquipment(this.state, p, defId)); }
  rentEquipment(defId) { return this.#act((p) => shop.rentEquipment(this.state, p, defId)); }
  disposeEquipment(instanceId) { return this.#act((p) => shop.disposeEquipment(this.state, p, instanceId)); }
  cancelRental(instanceId) { return this.#act((p) => shop.cancelRental(this.state, p, instanceId)); }
  assignEquipment(equipmentId, tradesmanId) { return this.#act((p) => shop.assignEquipment(this.state, p, equipmentId, tradesmanId)); }
  unassignEquipment(equipmentId) { return this.#act((p) => shop.unassignEquipment(this.state, p, equipmentId)); }
  relocate(buildingId) { return this.#act((p) => shop.relocate(this.state, p, buildingId)); }
  improveShop() { return this.#act((p) => { this.#requireBBB(p); return shop.improveShop(this.state, p); }); }
  // Growth as a deferred capital project: relocating up (a building id) or an in-place capacity bump
  // ("improve", BBB-gated). Pays a deposit, posts the town's trade contracts, completes next round.
  startExpansion(target) {
    return this.#act((p) => {
      if (target === "improve") this.#requireBBB(p);
      return expansion.startExpansion(this.state, p, target);
    });
  }
  buyService(kind) { return this.#act((p) => { this.#requireBBB(p); return modifiers.buyService(this.state, p, kind); }); }
  cancelService(kind) { return this.#act((p) => modifiers.cancelService(this.state, p, kind)); }
  #requireBBB(p) { if (!p.bbbThisTurn) throw new GameError("The BBB vendor fair isn't in town — wait for a BBB Special"); }
  drawCredit() { return this.#act((p) => modifiers.drawCredit(this.state, p, this.state.economy.line_of_credit.draw), true); }
  repayCredit(amount) { return this.#act((p) => modifiers.repayCredit(this.state, p, amount ?? this.state.economy.line_of_credit.draw), true); }
  playFavor(targetId, modId) {
    return this.#act((p) => {
      if (!cards.hasCardType(p, "favor")) throw new GameError(`${p.name} has no Favor card to play`);
      let line;
      if (modId === "union") {
        const before = this.state.globalEffects.length;
        this.state.globalEffects = this.state.globalEffects.filter((e) => e.kind !== "union");
        if (this.state.globalEffects.length === before) throw new GameError("There's no union to bust");
        line = `🪙 ${p.name} calls in a favor and BUSTS the union — firing is risky again, but cheap`;
      } else {
        line = modifiers.favorModifier(this.state, this.#playerById(targetId), modId);
      }
      cards.takeFromHand(p, cards.findHandCard(p, "favor").index);
      return line;
    });
  }

  assignJob(jobId, tradesmanId) { return this.#act((p) => jobs.assign(this.state, p, jobId, tradesmanId)); }
  holdJob(jobId) { return this.#act((p) => jobs.hold(this.state, p, jobId)); }
  resumeJob(jobId) { return this.#act((p) => jobs.resume(this.state, p, jobId)); }
  dropJob(jobId) { return this.#act((p) => jobs.drop(this.state, p, jobId)); }
  sellJob(jobId) { return this.#act((p) => jobs.sellJob(this.state, p, jobId)); }
  fixDefect(defectId) { return this.#act((p) => defects.fixDefect(this.state, p, defectId)); }

  // --- AR / AP ---------------------------------------------------------------------------

  factorInvoice(invoiceId) { return this.#act((p) => payables.factorInvoice(this.state, p, invoiceId), true); }
  factorClaim(payableId) { return this.#act((p) => payables.factorClaim(this.state, p, payableId), true); }
  payPayable(payableId) { return this.#act((p) => payables.payPayable(this.state, p, payableId), true); }

  // --- NPC court (a failed Demand Roll). The defendant may play a Slick Lawyer (own lawyer). --

  /** The queued court cases awaiting a defence decision. */
  get courtCases() { return this.state.pendingCourt; }

  /**
   * Resolve one court case. The defendant may play a Slick Lawyer (+2 to their walk threshold);
   * `accuserLawyers` is how many the table threw in for the vendor (−2 each).
   */
  resolveCourt(payableId, { lawyer = false, accuserLawyers = 0, roll = null } = {}) {
    const i = this.state.pendingCourt.findIndex((c) => c.payableId === payableId);
    if (i < 0) throw new GameError(`No pending court case for "${payableId}"`);
    const [c] = this.state.pendingCourt.splice(i, 1);
    const line = payables.resolveCourt(this.state, c, lawyer, accuserLawyers, roll);
    this.state.log.push(line);
    return line;
  }

  /** The getaway threshold a court / sue / damages roll WOULD use — for the dice UI (no side effects). */
  courtThreshold(payableId, lawyer = false) {
    const c = this.state.pendingCourt.find((x) => x.payableId === payableId);
    if (!c) return null;
    const e = this.state.economy;
    return getawayThreshold(e, e.civil.getaway_owed, lawyer ? 1 : 0, (c.agencyLawyer ? 1 : 0));
  }
  threatThreshold(ownLawyer = false) {
    const t = this.state.pendingThreat;
    if (!t || (t.type !== "sue" && t.type !== "damages")) return null;
    const e = this.state.economy;
    const base = t.type === "damages" ? e.civil.getaway_dispute : e.civil.getaway_owed;
    const acc = (t.type === "damages" ? t.accuserLawyers : t.creditorLawyers) ?? 0;
    return getawayThreshold(e, base, ownLawyer ? 1 : 0, acc);
  }

  /** Resolve ALL pending court cases (for AI seats / CLI / harness). Plays a lawyer if held. */
  autoResolveCourt({ useLawyer = true } = {}) {
    const lines = [];
    while (this.state.pendingCourt.length) {
      const c = this.state.pendingCourt[0];
      const owner = this.state.players.find((p) => p.id === c.playerId);
      const lawyer = useLawyer && owner.hand.some((x) => x.type === "slick_lawyer");
      lines.push(this.resolveCourt(c.payableId, { lawyer }));
    }
    return lines;
  }

  // --- Settlement offers (a natural 6 on the Demand Roll) ---------------------------------

  /** Settlement offers awaiting the player's accept/decline. */
  get settleCases() { return this.state.pendingSettle; }

  /** Accept (pay 50%, clear) or decline (keep dodging) a settlement offer. */
  resolveSettle(payableId, { accept }) {
    const i = this.state.pendingSettle.findIndex((c) => c.payableId === payableId);
    if (i < 0) throw new GameError(`No settlement offer for "${payableId}"`);
    const [c] = this.state.pendingSettle.splice(i, 1);
    const player = this.state.players.find((p) => p.id === c.playerId);
    const ap = player.payables.find((a) => a.id === c.payableId);
    if (ap) ap.in_settle = false;
    let line;
    if (accept && ap) {
      cashOut(this.state, player, ACCT.COGS_SUB, c.settle, `Settled ${c.vendor}`);
      player.payables = player.payables.filter((a) => a.id !== c.payableId);
      line = `🤝 ${player.name} took the settlement — paid ${w(c.settle)} to clear ${c.vendor}`;
    } else {
      line = `🎲 ${player.name} declined the settlement on ${c.vendor} — keeps dodging`;
    }
    this.state.log.push(line);
    return line;
  }

  /** Resolve all settlement offers (AI/CLI/harness): take them if affordable, else decline. */
  autoResolveSettle({ take = true } = {}) {
    const lines = [];
    while (this.state.pendingSettle.length) {
      const c = this.state.pendingSettle[0];
      const player = this.state.players.find((p) => p.id === c.playerId);
      lines.push(this.resolveSettle(c.payableId, { accept: take && player.cash >= c.settle }));
    }
    return lines;
  }

  // --- Poached: a rival lures a worker; counter (pay + roll) or let them go ---------------------
  get poachCases() { return this.state.pendingPoach; }
  /** counter 0 = let them go; 1/2/3 = pay that & roll — they stay on d6 ≤ (counter+2). The firing
   *  player rolls (the UI may supply `roll`); else the seeded die. */
  resolvePoach(workerId, { counter = 0, roll = null } = {}) {
    const i = this.state.pendingPoach.findIndex((x) => x.workerId === workerId);
    if (i < 0) throw new GameError(`No poach offer for "${workerId}"`);
    const [pp] = this.state.pendingPoach.splice(i, 1);
    const player = this.#playerById(pp.playerId);
    const t = player.tradesmen.find((x) => x.id === workerId);
    const walk = () => {
      if (t.assignedJob != null) jobs.releaseTradesman(this.state, player, t.id);
      for (const e of player.equipment) if (e.assigned_to === t.id) e.assigned_to = null; // free their tool so it reads idle for the next hire
      player.tradesmen = player.tradesmen.filter((x) => x.id !== t.id);
    };
    let line;
    if (!t) { line = `${workerId} was already gone before the offer landed`; }
    else if (counter <= 0) { walk(); line = `🚪 ${player.name} let ${workerId} walk — the Pettigrews got their hire`; }
    else {
      const c = Math.max(1, Math.min(3, counter));
      cashOut(this.state, player, ACCT.COGS_LABOUR, c, "Retention counter-offer");
      const threshold = c + 2;
      const r = roll != null ? roll : this.state.die();
      if (r <= threshold) line = `🤝 ${player.name} countered ${w(c)} — ${workerId} stays (rolled ${r} ≤ ${threshold})`;
      else { walk(); line = `💸 ${workerId} took the rival's offer anyway despite the ${w(c)} counter (rolled ${r} > ${threshold})`; }
    }
    this.state.log.push(line);
    return line;
  }
  /** AI/CLI/harness: counter with 2 W if it can spare it, else let them go. */
  autoResolvePoach() {
    const lines = [];
    while (this.state.pendingPoach.length) {
      const pp = this.state.pendingPoach[0];
      const player = this.#playerById(pp.playerId);
      lines.push(this.resolvePoach(pp.workerId, { counter: player.cash >= 4 ? 2 : 0 }));
    }
    return lines;
  }

  // --- The Mayor's re-election drive: buy a Favor (and seed networking_lunch) or pass -----------
  get mayorCases() { return this.state.pendingMayor; }
  resolveMayor({ buy = false } = {}) {
    const c = this.state.pendingMayor.shift();
    if (!c) throw new GameError("No Mayor drive to answer");
    const player = this.#playerById(c.playerId);
    const cost = this.state.economy.mayor_favor_cost ?? 10;
    let line;
    if (buy && player.cash >= cost) {
      cashOut(this.state, player, ACCT.MEALS, cost, "Mayor's re-election donation");
      player.hand.push({ id: "favor", type: "favor", name: "Favor" });
      injectById(this.state, player, "networking_lunch", this.state.economy.mayor_favor_lunches ?? 3, "the Mayor's good graces");
      line = `🪙 ${player.name} chipped in ${w(cost)} — a Favor now, and the Mayor steers work your way`;
    } else {
      line = `${player.name} passed on the Mayor's drive`;
    }
    this.state.log.push(line);
    return line;
  }
  /** AI/CLI/harness: chip in only with a healthy cash buffer. */
  autoResolveMayor() {
    const lines = [];
    while (this.state.pendingMayor.length) {
      const c = this.state.pendingMayor[0];
      const player = this.#playerById(c.playerId);
      const cost = this.state.economy.mayor_favor_cost ?? 10;
      lines.push(this.resolveMayor({ buy: player.cash >= cost * 2 }));
    }
    return lines;
  }

  // --- Referral wild card: a brokered job the contractor accepts (referrer earns a fee) or refuses
  get referralCases() { return this.state.pendingReferral; }
  resolveReferral(id, { accept = false } = {}) {
    const i = this.state.pendingReferral.findIndex((r) => r.id === id);
    if (i < 0) throw new GameError(`No referral "${id}"`);
    const [r] = this.state.pendingReferral.splice(i, 1);
    const referrer = this.#playerById(r.referrer_id);
    const contractor = this.#playerById(r.contractor_id);
    let line;
    if (accept) {
      // The contractor takes the job — and OWES the referrer the finder's fee as a player AP. They
      // can pay it, or stiff it and get dragged to court (the existing player-payable litigation).
      contractor.jobs.push(r.job);
      const terms = this.state.economy.referral_fee_terms ?? 2;
      contractor.payables.push(createPayable({ vendor: `${referrer.name} — referral fee`, amount: r.fee, dueTurn: this.state.turn + terms, isNpc: false, creditorId: referrer.id }));
      line = `🤝 ${contractor.name} takes the ${r.trade} referral — owes ${referrer.name} a ${w(r.fee)} finder's fee (net-${terms * 30})`;
    } else {
      line = `🚫 ${contractor.name} passes on the ${r.trade} referral — ${referrer.name} gets nothing`;
    }
    this.state.log.push(line);
    return line;
  }
  /** AI/CLI/harness: the contractor takes the referral if it has crew to spare, else passes.
   *  `shouldAuto(contractorId)` filters which to auto-resolve (the web only auto-answers AI shops). */
  autoResolveReferral(shouldAuto = () => true) {
    const auto = typeof shouldAuto === "function" ? shouldAuto : () => true; // tolerate a null arg (lockstep replay serializes no functions)
    const lines = [];
    for (const r of [...this.state.pendingReferral]) {
      if (!auto(r.contractor_id)) continue;
      const c = this.#playerById(r.contractor_id);
      const busy = c.jobs.filter((j) => ["Queued", "OnHold", "Active"].includes(j.state)).length;
      lines.push(this.resolveReferral(r.id, { accept: !c.bankrupt && c.tradesmen.length > busy }));
    }
    return lines;
  }

  // --- Hand cards that resolve immediately (no response window) ---------------------------

  /** Rush one of your own jobs: burn extra work now to recover lost time / salvage a late start. */
  playRush(jobId) {
    return this.#act((p) => {
      const job = p.jobs.find((j) => j.id === jobId);
      if (!job) throw new GameError(`No job "${jobId}" in your queue`);
      const { index } = cards.findHandCard(p, "rush");
      cards.takeFromHand(p, index);
      const msg = `${p.name} played Rush on ${job.name} — ${cards.applyRush(this.state.economy, job)}`;
      // In the Reckoning there's no work phase left, so a Rush that finishes the job completes
      // it on the spot (→ AR, which the closing books collect).
      if (this.state.phase === "reckoning" && job.work_done >= job.work_amount) {
        jobs.completeNow(this.state, p, job);
        return `${msg} — completed! (invoice ${p.invoices[p.invoices.length - 1].id})`;
      }
      return msg;
    }, true);
  }

  /** Buy Time on a job (your own / any), a payable, or an invoice — extend its deadline. */
  playBuyTime(targetId) {
    return this.#act((p) => {
      const { index } = cards.findHandCard(p, "buy_time");
      // Resolve the target: a job anywhere, or one of your payables/invoices.
      let what;
      const job = this.state.players.flatMap((x) => x.jobs).find((j) => j.id === targetId);
      const ap = p.payables.find((a) => a.id === targetId);
      const inv = p.invoices.find((i) => i.id === targetId);
      if (job) what = cards.applyBuyTimeJob(this.state.economy, job);
      else if (ap) what = cards.applyBuyTimeDue(this.state.economy, ap);
      else if (inv) what = cards.applyBuyTimeDue(this.state.economy, inv);
      else throw new GameError(`Buy Time: no job/payable/invoice "${targetId}"`);
      cards.takeFromHand(p, index);
      return `${p.name} played Buy Time on ${targetId} — ${what}`;
    }, true);
  }

  // --- Threats that open the response window ---------------------------------------------

  /** Play Sabotage against any job. Opens the response window (the owner may counter with Rush). */
  playSabotage(targetJobId) {
    return this.#act((attacker) => {
      const found = cards.findHandCard(attacker, "sabotage");
      const { owner, job } = this.#findJobAnywhere(targetJobId);
      const escrow = cards.takeFromHand(attacker, found.index);
      this.state.pendingThreat = {
        type: "sabotage", attackerId: attacker.id, ownerId: owner.id, jobId: job.id,
        card: escrow, counterableBy: found.card.counterable_by ?? ["rush"],
      };
      return `⚔️ ${attacker.name} quietly works against ${owner.name}'s ${job.name} (${job.id}) — a word to the inspector, a bolt left loose. ${owner.name} may answer with Rush.`;
    }, true);
  }

  /**
   * Sue another player to collect a late player-payable. Opens the response window: the debtor
   * may defend (play a Slick Lawyer) or fold. No deposit — it's a straight getaway roll at the
   * dispute base (50%), shifted ±2 per Slick Lawyer per side. Legal fee 1 W each on a contest.
   * @param opts { slick?: bool } the creditor plays their own Slick Lawyer (−2 to the debtor's walk)
   */
  sue(debtorId, payableId, opts = {}) {
    if (this.state.over) throw new GameError("The game is over");
    if (this.state.pendingCourt.length) throw new GameError("Resolve your court case first");
    if (this.state.pendingThreat) throw new GameError("Resolve the pending response window first");
    const creditor = this.currentPlayer;
    const debtor = this.#playerById(debtorId);
    const ap = debtor.payables.find((a) => a.id === payableId);
    if (!ap || ap.is_npc || ap.creditor_id !== creditor.id) throw new GameError(`No suable player-payable "${payableId}" owed to ${creditor.name}`);
    if (!ap.sue_window_remaining || ap.sue_window_remaining <= 0) throw new GameError(`The sue window on ${payableId} is closed`);

    let creditorLawyers = 0;
    if (opts.slick) { const f = cards.findHandCard(creditor, "slick_lawyer"); cards.takeFromHand(creditor, f.index); creditorLawyers = 1; }

    this.state.pendingThreat = {
      type: "sue", creditorId: creditor.id, debtorId, payableId, creditorLawyers,
      counterableBy: ["slick_lawyer"],
    };
    const msg = `⚖️ ${creditor.name} hauls ${debtor.name} before the Maple Hollow BBB over ${w(ap.amount)} (${payableId})${creditorLawyers ? ", slick lawyer in tow" : ""} — ${debtor.name} can defend or fold.`;
    this.state.log.push(msg);
    return { threat: this.state.pendingThreat, message: msg };
  }

  /** The threatened player responds. Resolves the open response window. */
  respondToThreat(decision = {}) {
    const t = this.state.pendingThreat;
    if (!t) throw new GameError("No pending response window");
    const msg = t.type === "sabotage" ? this.#resolveSabotage(t, decision)
      : t.type === "damages" ? this.#resolveDamages(t, decision)
      : this.#resolveSue(t, decision);
    this.state.pendingThreat = null;
    this.state.log.push(msg);
    return msg;
  }

  // --- Damages suit: a botched routed job. Hirer sues contractor; damages → the BANK. --------

  /** Open damages claims the current player (as hirer) may sue over. */
  get damagesCases() {
    return this.state.pendingDamages.filter((c) => c.hirerId === this.currentPlayer.id);
  }

  /** Sue the contractor who botched your routed job for damages (= the job value, to the bank). */
  sueDamages(jobId, opts = {}) {
    if (this.state.over) throw new GameError("The game is over");
    if (this.state.pendingCourt.length || this.state.pendingThreat) throw new GameError("Resolve the open matter first");
    const hirer = this.currentPlayer;
    const claim = this.state.pendingDamages.find((c) => c.jobId === jobId && c.hirerId === hirer.id);
    if (!claim) throw new GameError(`No damages claim for "${jobId}"`);
    let hirerLawyers = 0;
    if (opts.slick) { const f = cards.findHandCard(hirer, "slick_lawyer"); cards.takeFromHand(hirer, f.index); hirerLawyers = 1; }
    this.state.pendingDamages = this.state.pendingDamages.filter((c) => c !== claim);
    this.state.pendingThreat = {
      type: "damages", jobId, hirerId: hirer.id, contractorId: claim.contractorId,
      value: claim.value, jobName: claim.jobName, accuserLawyers: hirerLawyers, counterableBy: ["slick_lawyer"],
    };
    const contractor = this.#playerById(claim.contractorId);
    const msg = `⚖️ ${hirer.name} sues ${contractor.name} for botching ${claim.jobName} — ${w(claim.value)} in damages${hirerLawyers ? ", slick lawyer in tow" : ""}. ${contractor.name} may defend.`;
    this.state.log.push(msg);
    return { threat: this.state.pendingThreat, message: msg };
  }

  #resolveDamages(t, { contest = true, ownLawyer = false, roll = null }) {
    const e = this.state.economy;
    const hirer = this.#playerById(t.hirerId);
    const contractor = this.#playerById(t.contractorId);
    if (!contest) {
      cashOut(this.state, contractor, ACCT.LEGAL, t.value, "Damages — conceded");
      return `🏳️ ${contractor.name} concedes — ${w(t.value)} in damages to the bank.`;
    }
    let defLawyers = 0;
    if (ownLawyer) {
      if (!cards.hasCardType(contractor, "slick_lawyer")) throw new GameError(`${contractor.name} has no Slick Lawyer`);
      cards.takeFromHand(contractor, cards.findHandCard(contractor, "slick_lawyer").index);
      defLawyers = 1;
    }
    const g = getawayThreshold(e, e.civil.getaway_dispute, defLawyers, t.accuserLawyers);
    const res = rollGetaway(roll != null ? () => roll : this.state.die, g);
    const FEE = e.civil.legal_fee;
    cashOut(this.state, hirer, ACCT.LEGAL, FEE, "Damages — fee");
    cashOut(this.state, contractor, ACCT.LEGAL, FEE, "Damages — fee");
    if (res.getsAway) {
      return `⚖️ ${contractor.name} WALKS the damages suit (rolled ${res.roll} ≤ ${g}, ${getawayOdds(g)}) — no damages; ${w(FEE)} fee each.`;
    }
    cashOut(this.state, contractor, ACCT.LEGAL, t.value, "Damages — lost");
    return `⚖️ ${hirer.name} WINS — ${contractor.name} pays ${w(t.value)} in damages to the bank (rolled ${res.roll} > ${g}); ${w(FEE)} fee each.`;
  }

  /** Auto-resolve pending damages claims for AI/CLI/harness: the hirer sues if it can spare a fee. */
  autoResolveDamages() {
    const lines = [];
    for (const c of [...this.damagesCases]) {
      const hirer = this.currentPlayer;
      if (hirer.cash <= this.state.economy.civil.legal_fee * 2) continue; // skip if too poor to bother
      this.sueDamages(c.jobId);
      const contractor = this.#playerById(c.contractorId);
      lines.push(this.respondToThreat({ contest: cards.hasCardType(contractor, "slick_lawyer") }));
    }
    return lines;
  }

  #resolveSabotage(t, { counter }) {
    const owner = this.#playerById(t.ownerId);
    const job = owner.jobs.find((j) => j.id === t.jobId);
    if (counter) {
      if (!cards.hasCardType(owner, "rush")) throw new GameError(`${owner.name} has no Rush to counter with`);
      cards.takeFromHand(owner, cards.findHandCard(owner, "rush").index);
      return `🛡️ ${owner.name} smells it coming and rushes the crew — the dirty trick on ${job?.name ?? t.jobId} comes to nothing.`;
    }
    if (!job) return `The scheme fizzles — ${t.jobId} is already gone.`;
    // In the Reckoning there's no work phase left, so Sabotage simply kills the job: the rival
    // loses any AR from it, and a forced job hands its client a suable deposit debt.
    if (this.state.phase === "reckoning") {
      const owed = jobs.abandonJob(this.state, owner, job);
      return `💥 At the buzzer, ${owner.name}'s ${job.name} is sunk for good${owed ? ` — ${owed}` : " — no payday there"}.`;
    }
    return `💥 Word gets around the Hollow: ${owner.name}'s ${job.name} slips toward the wire — ${cards.applySabotage(this.state.economy, job)}.`;
  }

  #resolveSue(t, { contest = true, ownLawyer = false, roll = null }) {
    const e = this.state.economy;
    const creditor = this.#playerById(t.creditorId);
    const debtor = this.#playerById(t.debtorId);
    const ap = debtor.payables.find((a) => a.id === t.payableId);
    const settle = () => { debtor.payables = debtor.payables.filter((a) => a.id !== t.payableId); };

    // You can't get blood from a stone: a creditor only collects what the debtor can actually
    // cover (capped at their cash before court costs); any shortfall is uncollectible and the
    // debt is settled regardless. So suing a near-broke rival nets scraps — the play is to bury
    // them, not to get paid.
    const collectible = Math.max(0, Math.min(ap.amount, debtor.cash));
    const shortNote = collectible < ap.amount ? ` — only ${w(collectible)} of the ${w(ap.amount)} was collectible` : "";

    if (!contest) {
      cashOut(this.state, debtor, ACCT.COGS_SUB, collectible, "Folded — paid the creditor");
      cashIn(this.state, creditor, ACCT.REVENUE, collectible, `Collected from ${debtor.name}`);
      settle();
      return `🏳️ ${debtor.name} folds rather than fight it — pays ${creditor.name} ${w(collectible)}${shortNote}.`;
    }
    let defLawyers = 0;
    if (ownLawyer) {
      if (!cards.hasCardType(debtor, "slick_lawyer")) throw new GameError(`${debtor.name} has no Slick Lawyer to play`);
      cards.takeFromHand(debtor, cards.findHandCard(debtor, "slick_lawyer").index);
      defLawyers = 1;
    }
    // Refusing to pay for delivered work is the clearly-wrong case → owed base (walk on 1–2).
    // Each Slick Lawyer shifts ±2. Legal fee 1 W each.
    const g = getawayThreshold(e, e.civil.getaway_owed, defLawyers, t.creditorLawyers);
    const res = rollGetaway(roll != null ? () => roll : this.state.die, g);
    const FEE = e.civil.legal_fee;
    cashOut(this.state, creditor, ACCT.LEGAL, FEE, "Suit — fee");
    cashOut(this.state, debtor, ACCT.LEGAL, FEE, "Suit — fee");
    if (res.getsAway) {
      return `⚖️ ${debtor.name} WALKS (rolled ${res.roll} ≤ ${g}, ${getawayOdds(g)}) — debt stands; ${w(FEE)} legal fee each.`;
    }
    cashOut(this.state, debtor, ACCT.COGS_SUB, collectible, "Lost the suit — paid");
    cashIn(this.state, creditor, ACCT.REVENUE, collectible, `Won suit vs ${debtor.name}`);
    settle();
    return `⚖️ ${creditor.name} WINS (${debtor.name} rolled ${res.roll} > ${g}) — collects ${w(collectible)}${shortNote}; ${w(FEE)} legal fee each.`;
  }
}
