// Game orchestrator — the single API surface the UI talks to. It owns the state, runs the
// phases in order, and routes action calls to shop.js for the *current* player only. The UI
// never mutates state directly; it asks the Game, and the Game enforces the rules.

import { createGame } from "../state/state.js";
import { GameError } from "./economy.js";
import * as shop from "./shop.js";
import * as jobs from "./jobs.js";
import * as cards from "./cards.js";
import * as payables from "./payables.js";
import { drawFortune } from "./fortune.js";
import { civilTarget, rollCivil } from "./litigation.js";
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
      if (total > 0) lines.push(`  ${p.name} collects ${w(total)} in receivables`);
      p.cash += total;
      p.invoices = [];
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
    const upkeep = runUpkeep(this.state, player);
    this.state.log.push(...upkeep.lines);
    const canAct = !player.bankrupt;
    const drawn = canAct ? drawFortune(this.state, player, this.drawPowerFor(player)) : [];
    for (const d of drawn) this.state.log.push(`${player.name} drew ${d.name}: ${d.text}`);
    return {
      over: false,
      turn: this.state.turn,
      player,
      upkeep,
      drawn,
      canAct, // a bankrupt player has no action phase
    };
  }

  // --- Action phase: each delegates to shop.js for the current player, logs, and guards. ---

  #act(fn, finalLegal = false) {
    if (this.state.over) throw new GameError("The game is over");
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
  fire(tradesmanId) { return this.#act((p) => shop.fire(this.state, p, tradesmanId)); }
  buyEquipment(defId) { return this.#act((p) => shop.buyEquipment(this.state, p, defId)); }
  rentEquipment(defId) { return this.#act((p) => shop.rentEquipment(this.state, p, defId)); }
  disposeEquipment(instanceId) { return this.#act((p) => shop.disposeEquipment(this.state, p, instanceId)); }
  cancelRental(instanceId) { return this.#act((p) => shop.cancelRental(this.state, p, instanceId)); }
  relocate(buildingId) { return this.#act((p) => shop.relocate(this.state, p, buildingId)); }

  assignJob(jobId, tradesmanId) { return this.#act((p) => jobs.assign(this.state, p, jobId, tradesmanId)); }
  holdJob(jobId) { return this.#act((p) => jobs.hold(this.state, p, jobId)); }
  dropJob(jobId) { return this.#act((p) => jobs.drop(this.state, p, jobId)); }

  // --- AR / AP ---------------------------------------------------------------------------

  factorInvoice(invoiceId) { return this.#act((p) => payables.factorInvoice(this.state, p, invoiceId), true); }
  payPayable(payableId) { return this.#act((p) => payables.payPayable(this.state, p, payableId), true); }

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
   * Sue another player to collect a late player-payable. Opens the response window (the debtor
   * must match the deposit to contest, and may play Slick Lawyer as own counsel).
   * @param opts { slick?: bool } the creditor plays their own Slick Lawyer (+target)
   */
  sue(debtorId, payableId, opts = {}) {
    if (this.state.over) throw new GameError("The game is over");
    if (this.state.pendingThreat) throw new GameError("Resolve the pending response window first");
    const creditor = this.currentPlayer;
    const debtor = this.#playerById(debtorId);
    const ap = debtor.payables.find((a) => a.id === payableId);
    if (!ap || ap.is_npc || ap.creditor_id !== creditor.id) throw new GameError(`No suable player-payable "${payableId}" owed to ${creditor.name}`);
    if (!ap.sue_window_remaining || ap.sue_window_remaining <= 0) throw new GameError(`The sue window on ${payableId} is closed`);

    const deposit = this.state.economy.civil.deposit;
    if (creditor.cash < deposit) throw new GameError(`${creditor.name} can't post the ${w(deposit)} deposit`);
    let creditorSlick = false;
    if (opts.slick) { const f = cards.findHandCard(creditor, "slick_lawyer"); cards.takeFromHand(creditor, f.index); creditorSlick = true; }
    creditor.cash -= deposit;

    this.state.pendingThreat = {
      type: "sue", creditorId: creditor.id, debtorId, payableId, pot: deposit, creditorSlick,
      counterableBy: ["slick_lawyer"],
    };
    const msg = `⚖️ ${creditor.name} hauls ${debtor.name} before the Maple Hollow BBB over ${w(ap.amount)} (${payableId})${creditorSlick ? ", slick lawyer in tow" : ""} — ${debtor.name} must match the ${w(deposit)} deposit or fold.`;
    this.state.log.push(msg);
    return { threat: this.state.pendingThreat, message: msg };
  }

  /** The threatened player responds. Resolves the open response window. */
  respondToThreat(decision = {}) {
    const t = this.state.pendingThreat;
    if (!t) throw new GameError("No pending response window");
    const msg = t.type === "sabotage" ? this.#resolveSabotage(t, decision) : this.#resolveSue(t, decision);
    this.state.pendingThreat = null;
    this.state.log.push(msg);
    return msg;
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

    if (!contest) {
      // Lose by default: debtor pays, creditor recovers deposit + the debt.
      creditor.cash += t.pot; // deposit back
      debtor.cash -= ap.amount;
      creditor.cash += ap.amount;
      settle();
      return `🏳️ ${debtor.name} folds rather than fight it — pays ${creditor.name} ${w(ap.amount)}.`;
    }
    // Contest: debtor matches the deposit (or can't → treated as concede).
    if (debtor.cash < e.civil.deposit) {
      creditor.cash += t.pot;
      debtor.cash -= ap.amount;
      creditor.cash += ap.amount;
      settle();
      return `${debtor.name} can't match the deposit — loses by default, pays ${creditor.name} ${w(ap.amount)}`;
    }
    if (ownLawyer && !cards.hasCardType(debtor, "slick_lawyer")) throw new GameError(`${debtor.name} has no Slick Lawyer to play`);
    debtor.cash -= e.civil.deposit;
    const pot = t.pot + e.civil.deposit;
    if (ownLawyer) { cards.takeFromHand(debtor, cards.findHandCard(debtor, "slick_lawyer").index); }

    // Defendant = debtor. Late debt weakens them (+1); creditor's slick +2; own lawyer −1.
    const target = civilTarget(e, { late: true, slick: t.creditorSlick, ownLawyer });
    const res = rollCivil(this.state.die, target);
    if (res.defendantWins) {
      debtor.cash += pot; // debtor takes the pot; debt survives (window keeps ticking)
      return `⚖️ ${debtor.name} WINS the suit (defend ${target}+, rolled ${res.roll}) — takes the ${w(pot)} pot; debt stands`;
    }
    creditor.cash += pot + ap.amount;
    debtor.cash -= ap.amount;
    settle();
    return `⚖️ ${creditor.name} WINS the suit (${debtor.name} needed ${target}+, rolled ${res.roll}) — collects ${w(ap.amount)} + the ${w(pot)} pot`;
  }
}
