// Accounts payable & receivable lifecycle (Stage 4, Dial 6) plus the Civil events that feed
// it. Stretching NPC vendors is free float — but every turn you dodge is a gamble that runs
// through the escalating Demand Roll and, on a fail, to court. Player vendors instead open a
// 4-turn sue window. Class Action force-settles everyone's AP at once.

import { GameError, w } from "./economy.js";
import { createPayable } from "../state/state.js";
import { getawayThreshold, rollGetaway, getawayOdds } from "./litigation.js";
import { post, cashIn, cashOut, ACCT } from "../state/ledger.js";
import { factoringFeeRate } from "./modifiers.js";

const playerById = (state, id) => state.players.find((p) => p.id === id);

// --- AR factoring -----------------------------------------------------------------------

/** Factor an NPC invoice (your own completed job) for immediate cash. The client pays the
 * factor off-screen, so the invoice simply leaves your books. */
export function factorInvoice(state, player, invoiceId) {
  const inv = player.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new GameError(`No invoice "${invoiceId}"`);
  const fee = Math.ceil(inv.amount * factoringFeeRate(player, state.economy.factoring_fee));
  const proceeds = inv.amount - fee;
  post(state, player, `Factor ${inv.id}`, [
    { acct: ACCT.CASH, amt: proceeds },
    { acct: ACCT.PROF_FEES, amt: fee }, // the factoring discount is a financing cost
    { acct: ACCT.AR, amt: -inv.amount }, // clears the receivable
  ]);
  player.invoices = player.invoices.filter((i) => i.id !== invoiceId);
  return `${player.name} factored ${inv.id} (${w(inv.amount)}) for ${w(proceeds)} now — ${w(fee)} fee`;
}

/**
 * Factor a PLAYER receivable — a debt a rival owes you (their payable, creditor_id === you).
 * Same fee as an invoice, but instead of vanishing the debt is SOLD to a collections agency: it
 * converts to an NPC-style bill on the debtor's books that runs the Demand Roll, and the agency
 * brings a GUARANTEED slick lawyer to court (agency_lawyer) — so it's much harder for the rival
 * to dodge. You take the haircut; they take the heat.
 */
export function factorClaim(state, player, payableId) {
  let debtor, ap;
  for (const d of state.players) {
    const found = d.payables.find((a) => a.id === payableId && a.creditor_id === player.id);
    if (found) { debtor = d; ap = found; break; }
  }
  if (!ap) throw new GameError(`No receivable "${payableId}" owed to ${player.name}`);
  if (ap.pending) throw new GameError(`That contract isn't delivered yet — nothing to collect`);
  // The agency won't pay for more than it can collect: proceeds are priced on what the debtor
  // can actually cover (their cash), not the face value. A debt from a near-broke rival fetches
  // almost nothing — you're really just handing the agency a kill order.
  const collectible = Math.max(0, Math.min(ap.amount, debtor.cash));
  const fee = Math.ceil(collectible * factoringFeeRate(player, state.economy.factoring_fee));
  const proceeds = collectible - fee;
  cashIn(state, player, ACCT.OTHER_INCOME, proceeds, "Sold a debt to collections");
  // Hand the debt to collections: NPC-style bill + a guaranteed lawyer in court.
  ap.is_npc = true;
  ap.creditor_id = null;
  ap.collections = true;
  ap.agency_lawyer = true;
  ap.turns_dodged = 0;
  ap.sue_window_remaining = null;
  ap.vendor = `Collections agency (for ${player.name})`;
  const priceNote = collectible < ap.amount
    ? `${w(proceeds)} now (heavily discounted — ${debtor.name} can barely cover it)`
    : `${w(proceeds)} now (${w(fee)} fee)`;
  return `${player.name} sold ${debtor.name}'s ${w(ap.amount)} debt to collections for ${priceNote} — the agency will hound ${debtor.name}, lawyer in hand`;
}

// --- Paying AP --------------------------------------------------------------------------

/** Pay a payable in full now. A player payable pays the creditor; an NPC payable, the bank. */
export function payPayable(state, player, payableId) {
  const ap = player.payables.find((a) => a.id === payableId);
  if (!ap) throw new GameError(`No payable "${payableId}"`);
  if (player.cash < ap.amount) throw new GameError(`${player.name} can't cover ${w(ap.amount)} (has ${w(player.cash)})`);
  cashOut(state, player, ACCT.COGS_SUB, ap.amount, `Pay ${ap.vendor}`);
  if (!ap.is_npc && ap.creditor_id) {
    const creditor = playerById(state, ap.creditor_id);
    if (creditor) cashIn(state, creditor, ACCT.REVENUE, ap.amount, `Collect from ${player.name}`);
  }
  player.payables = player.payables.filter((a) => a.id !== payableId);
  return `${player.name} paid ${ap.vendor} ${w(ap.amount)} in full`;
}

// --- Upkeep: process due payables -------------------------------------------------------

/**
 * Called at upkeep. For each due, unpaid payable: NPC payables run a Demand Roll (dodge again,
 * settle, forgive, or fail → court); player payables tick their sue window down toward
 * forgiveness. Returns log lines. Cash effects can push the player toward bankruptcy.
 */
export function processDuePayables(state, player) {
  const lines = [];
  for (const ap of [...player.payables]) {
    if (ap.settled || ap.in_court || ap.in_settle || ap.pending || state.turn < ap.due_turn) continue;
    lines.push(...(ap.is_npc ? dodgeNpc(state, player, ap) : tickPlayerWindow(state, player, ap)));
  }
  return lines;
}

function removeAp(player, ap) {
  player.payables = player.payables.filter((a) => a.id !== ap.id);
}

/** Incur a bill: create the payable AND accrue it (Dr the expense split / Cr AP) so it sits on the
 *  balance sheet until paid. `debits` is the expense lines (their sum must equal the amount). A PENDING
 *  player AP is left un-accrued — it books at delivery (legacy cash-basis for now). */
export function incurPayable(state, player, opts) {
  const ap = createPayable(opts);
  if (!ap.pending && opts.debits?.length) {
    post(state, player, opts.memo ?? `Bill — ${ap.vendor}`, [...opts.debits, { acct: ACCT.AP, amt: -ap.amount }]);
    ap.accrued = true;
  }
  player.payables.push(ap);
  return ap;
}

/** Settle a payable off the books. ACCRUED bill → Dr AP / Cr Cash (paid), any shortfall to Other
 *  income (forgiven/settled below face). A not-accrued (legacy/pending) AP keeps the old cash-basis
 *  Dr COGS-Sub / Cr Cash when paid, or just drops when forgiven. */
export function clearPayable(state, player, ap, { cashAmt = null, reason = "Paid" } = {}) {
  if (ap.accrued) {
    const lines = [{ acct: ACCT.AP, amt: ap.amount }];
    if (cashAmt) lines.push({ acct: ACCT.CASH, amt: -cashAmt });
    const gain = ap.amount - (cashAmt ?? 0);
    if (Math.abs(gain) > 0.001) lines.push({ acct: ACCT.OTHER_INCOME, amt: -gain });
    post(state, player, `${reason} — ${ap.vendor}`, lines);
  } else if (cashAmt) {
    cashOut(state, player, ACCT.COGS_SUB, cashAmt, `${reason} — ${ap.vendor}`);
  }
  removeAp(player, ap);
}

function dodgeNpc(state, player, ap) {
  const e = state.economy;
  ap.turns_dodged += 1;
  const roll = state.die();

  // A natural 6 → settlement offer (pay 50% to clear), EVERY round. Auto-taken if affordable
  // (an interactive accept/decline prompt comes with the litigation UI in Stage 2/3).
  if (roll === 6) {
    const settle = Math.ceil(ap.amount * e.npc_demand.settle_fraction);
    if (player.cash >= settle) {
      // Offer the settlement — the player chooses to take it or keep dodging (resolved via
      // game.resolveSettle / autoResolveSettle).
      ap.in_settle = true;
      state.pendingSettle.push({ playerId: player.id, payableId: ap.id, vendor: ap.vendor, amount: ap.amount, settle });
      return [`🤝 ${player.name} rolled a 6 on ${ap.vendor} — offered settlement: pay ${w(settle)} (50%) to clear, or keep dodging`];
    }
    return [`🎲 ${player.name} rolled a 6 on ${ap.vendor} but can't afford the 50% settlement — keeps dodging`];
  }
  // Otherwise pass on (1 + dodge#)+ to dodge again, until the last allowed dodge.
  const target = 1 + ap.turns_dodged;
  if (ap.turns_dodged < e.npc_demand.max_dodges && roll >= target) {
    return [`🎲 ${player.name} dodged ${ap.vendor} again (rolled ${roll} vs ${target}+), ${w(ap.amount)} still owed`];
  }
  // Fail → court. Queue it so the defendant can play a Slick Lawyer before the roll. A debt sold
  // to collections brings the agency's guaranteed lawyer (agencyLawyer) — harder to walk.
  ap.in_court = true;
  state.pendingCourt.push({ playerId: player.id, payableId: ap.id, vendor: ap.vendor, amount: ap.amount, agencyLawyer: !!ap.agency_lawyer });
  const odds = ap.agency_lawyer
    ? "the agency's lawyer makes it 1-only unless you lawyer up too"
    : "you walk on 1–2; a Slick Lawyer makes it 1–4";
  return [`⚖️ ${player.name} failed the Demand Roll on ${ap.vendor} — summoned to court (${odds})`];
}

/**
 * Resolve one queued NPC court case. The defendant may play a Slick Lawyer (own lawyer, −1 to
 * the defence target) before the roll. Win → walk clean (debt wiped, fee reimbursed); lose →
 * pay the amount + damages fee. Consumes the lawyer card if used. Returns a log line.
 */
export function resolveCourt(state, caseEntry, useLawyer, accuserLawyers = 0, roll = null) {
  const e = state.economy;
  const player = state.players.find((p) => p.id === caseEntry.playerId);
  const ap = player.payables.find((a) => a.id === caseEntry.payableId);
  let defLawyers = 0;
  if (useLawyer) {
    const idx = player.hand.findIndex((c) => c.type === "slick_lawyer");
    if (idx >= 0) { player.hand.splice(idx, 1); defLawyers = 1; state.log.push(`🧑‍⚖️ ${player.name} plays a Slick Lawyer`); }
  }
  // A collections case carries the agency's guaranteed lawyer on the accuser's side.
  const accLawyers = accuserLawyers + (caseEntry.agencyLawyer ? 1 : 0);
  const g = getawayThreshold(e, e.civil.getaway_owed, defLawyers, accLawyers);
  const res = rollGetaway(roll != null ? () => roll : state.die, g);
  if (ap) removeAp(player, ap);
  cashOut(state, player, ACCT.LEGAL, e.civil.legal_fee, "Court — legal fee"); // paid regardless
  const tag = defLawyers ? " (lawyered up)" : caseEntry.agencyLawyer ? " (vs collections)" : "";
  if (res.getsAway) {
    return `⚖️ ${player.name}${tag} WALKS — rolled ${res.roll} ≤ ${g} (${getawayOdds(g)}); ${caseEntry.vendor} debt wiped, ${w(e.civil.legal_fee)} legal fee`;
  }
  cashOut(state, player, ACCT.COGS_SUB, caseEntry.amount, `Court loss — ${caseEntry.vendor}`);
  return `⚖️ ${player.name}${tag} LOSES — rolled ${res.roll} > ${g}; pays ${caseEntry.vendor} ${w(caseEntry.amount)} + ${w(e.civil.legal_fee)} fee`;
}

function tickPlayerWindow(state, player, ap) {
  if (ap.sue_window_remaining === null) {
    ap.sue_window_remaining = state.economy.sue_window;
    return [`${player.name} is late paying ${ap.vendor} — a ${ap.sue_window_remaining}-turn sue window opens`];
  }
  ap.sue_window_remaining -= 1;
  ap.turns_dodged = (ap.turns_dodged ?? 0) + 1; // a stalled player debt accrues dodge-count (mirrors NPC bills; cues a creditor to sue)
  if (ap.sue_window_remaining <= 0) {
    removeAp(player, ap);
    return [`${player.name}'s creditor never sued — ${ap.vendor} debt of ${w(ap.amount)} is forgiven`];
  }
  return [`${player.name} still owes ${ap.vendor} ${w(ap.amount)} — ${ap.sue_window_remaining} turn(s) left to sue`];
}

// --- Class Action -----------------------------------------------------------------------

/** Force every player to settle ALL their AP at full value immediately. One copy in the deck. */
export function classAction(state) {
  const lines = ["🏛️ CLASS ACTION — every player must settle all AP at full value now:"];
  for (const player of state.players) {
    const total = player.payables.reduce((s, a) => s + a.amount, 0);
    if (total > 0) {
      cashOut(state, player, ACCT.COGS_SUB, total, "Class action settlement");
      player.payables = [];
      lines.push(`   ${player.name} settled ${w(total)} of AP`);
    }
  }
  return lines;
}

// --- Civil events (drawn via a Fortune 'summons') ---------------------------------------

/** Resolve a Civil event card against the drawing player. Leads with the card's flavor. */
export function resolveCivilEvent(state, player, card) {
  const e = state.economy;
  const flavor = card.flavor ? [`“${card.flavor}”`] : [];
  switch (card.type) {
    case "class_action":
      return [...flavor, ...classAction(state)];
    case "windfall":
      cashIn(state, player, ACCT.OTHER_INCOME, card.cash ?? 0, card.name);
      return [...flavor, `🎀 ${player.name}: ${card.name} — +${w(card.cash ?? 0)}`];
    case "back_taxes":
    case "audit": {
      const ap = createPayable({ vendor: card.name, amount: card.amount ?? 5, dueTurn: state.turn + (card.due ?? 2), isNpc: true });
      player.payables.push(ap);
      return [...flavor, `🧾 ${player.name}: ${card.name} — owes ${w(ap.amount)} (due turn ${ap.due_turn}, ${ap.id})`];
    }
    case "lawsuit": {
      // An NPC sues the player — a getaway roll at the dispute base (you walk on 1–3, 50%).
      const g = getawayThreshold(e, e.civil.getaway_dispute);
      const res = rollGetaway(state.die, g);
      cashOut(state, player, ACCT.LEGAL, e.civil.legal_fee, `${card.name} — fee`);
      if (res.getsAway) return [...flavor, `⚖️ ${player.name} was sued (${card.name}) and WALKED (rolled ${res.roll} ≤ ${g}) — ${w(e.civil.legal_fee)} fee`];
      const claim = card.amount ?? 5;
      cashOut(state, player, ACCT.LEGAL, claim, `${card.name} — damages`);
      return [...flavor, `⚖️ ${player.name} was sued (${card.name}) and LOST (rolled ${res.roll} > ${g}) — paid ${w(claim)} + ${w(e.civil.legal_fee)} fee`];
    }
    default:
      return [...flavor, `${player.name}: ${card.name} (no effect)`];
  }
}
