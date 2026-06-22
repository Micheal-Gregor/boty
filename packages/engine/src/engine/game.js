// Game orchestrator — the single API surface the UI talks to. It owns the state, runs the
// phases in order, and routes action calls to shop.js for the *current* player only. The UI
// never mutates state directly; it asks the Game, and the Game enforces the rules.

import { createGame } from "../state/state.js";
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
import { getawayThreshold, rollGetaway, getawayOdds } from "./litigation.js";
import { w } from "./economy.js";
import { runUpkeep, advance, results } from "./turn.js";

export class Game {
  constructor(economy, playerSeeds, options = {}) {
    this.state = createGame(economy, playerSeeds, options);
  }

  /** Draw power = number of tradespeople, capped (Dial: draw_cap). */
  drawPowerFor(player) {
    const cap = this.state.economy.draw_cap ?? Infinity;
    return Math.min(player.tradesmen.length, cap);
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
  endTurn() {
    this.runProgress();
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
      return employment.fireWorker(this.state, p, tradesmanId, { ownLawyer });
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
  resolveCourt(payableId, { lawyer = false, accuserLawyers = 0 } = {}) {
    const i = this.state.pendingCourt.findIndex((c) => c.payableId === payableId);
    if (i < 0) throw new GameError(`No pending court case for "${payableId}"`);
    const [c] = this.state.pendingCourt.splice(i, 1);
    const line = payables.resolveCourt(this.state, c, lawyer, accuserLawyers);
    this.state.log.push(line);
    return line;
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

  #resolveDamages(t, { contest = true, ownLawyer = false }) {
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
    const res = rollGetaway(this.state.die, g);
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

  #resolveSue(t, { contest = true, ownLawyer = false }) {
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
    const res = rollGetaway(this.state.die, g);
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
