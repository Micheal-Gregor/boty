// Accounts payable & receivable lifecycle (Stage 4, Dial 6) plus the Civil events that feed
// it. Stretching NPC vendors is free float — but every turn you dodge is a gamble that runs
// through the escalating Demand Roll and, on a fail, to court. Player vendors instead open a
// 4-turn sue window. Class Action force-settles everyone's AP at once.

import { GameError, w } from "./economy.js";
import { createPayable } from "../state/state.js";
import { getawayThreshold, rollGetaway, getawayOdds } from "./litigation.js";

const playerById = (state, id) => state.players.find((p) => p.id === id);

// --- AR factoring -----------------------------------------------------------------------

/** Factor an invoice for immediate cash at the factoring fee (the escape valve). */
export function factorInvoice(state, player, invoiceId) {
  const inv = player.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new GameError(`No invoice "${invoiceId}"`);
  const fee = Math.ceil(inv.amount * state.economy.factoring_fee);
  const proceeds = inv.amount - fee;
  player.cash += proceeds;
  player.invoices = player.invoices.filter((i) => i.id !== invoiceId);
  return `${player.name} factored ${inv.id} (${w(inv.amount)}) for ${w(proceeds)} now — ${w(fee)} fee`;
}

// --- Paying AP --------------------------------------------------------------------------

/** Pay a payable in full now. A player payable pays the creditor; an NPC payable, the bank. */
export function payPayable(state, player, payableId) {
  const ap = player.payables.find((a) => a.id === payableId);
  if (!ap) throw new GameError(`No payable "${payableId}"`);
  if (player.cash < ap.amount) throw new GameError(`${player.name} can't cover ${w(ap.amount)} (has ${w(player.cash)})`);
  player.cash -= ap.amount;
  if (!ap.is_npc && ap.creditor_id) {
    const creditor = playerById(state, ap.creditor_id);
    if (creditor) creditor.cash += ap.amount;
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
    if (ap.settled || ap.in_court || state.turn < ap.due_turn) continue;
    lines.push(...(ap.is_npc ? dodgeNpc(state, player, ap) : tickPlayerWindow(state, player, ap)));
  }
  return lines;
}

function removeAp(player, ap) {
  player.payables = player.payables.filter((a) => a.id !== ap.id);
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
      player.cash -= settle;
      removeAp(player, ap);
      return [`🤝 ${player.name} rolled a 6 — settled ${ap.vendor} at ${w(settle)} (50%)`];
    }
    return [`🎲 ${player.name} rolled a 6 on ${ap.vendor} but can't afford the 50% settlement — keeps dodging`];
  }
  // Otherwise pass on (1 + dodge#)+ to dodge again, until the last allowed dodge.
  const target = 1 + ap.turns_dodged;
  if (ap.turns_dodged < e.npc_demand.max_dodges && roll >= target) {
    return [`🎲 ${player.name} dodged ${ap.vendor} again (rolled ${roll} vs ${target}+), ${w(ap.amount)} still owed`];
  }
  // Fail → court. Queue it so the defendant can play a Slick Lawyer before the roll.
  ap.in_court = true;
  state.pendingCourt.push({ playerId: player.id, payableId: ap.id, vendor: ap.vendor, amount: ap.amount });
  return [`⚖️ ${player.name} failed the Demand Roll on ${ap.vendor} — summoned to court (you walk on 1–2; a Slick Lawyer makes it 1–4)`];
}

/**
 * Resolve one queued NPC court case. The defendant may play a Slick Lawyer (own lawyer, −1 to
 * the defence target) before the roll. Win → walk clean (debt wiped, fee reimbursed); lose →
 * pay the amount + damages fee. Consumes the lawyer card if used. Returns a log line.
 */
export function resolveCourt(state, caseEntry, useLawyer, accuserLawyers = 0) {
  const e = state.economy;
  const player = state.players.find((p) => p.id === caseEntry.playerId);
  const ap = player.payables.find((a) => a.id === caseEntry.payableId);
  let defLawyers = 0;
  if (useLawyer) {
    const idx = player.hand.findIndex((c) => c.type === "slick_lawyer");
    if (idx >= 0) { player.hand.splice(idx, 1); defLawyers = 1; }
  }
  const g = getawayThreshold(e, e.civil.getaway_owed, defLawyers, accuserLawyers);
  const res = rollGetaway(state.die, g);
  if (ap) removeAp(player, ap);
  player.cash -= e.civil.legal_fee; // legal fee, paid regardless
  const tag = defLawyers ? " (lawyered up)" : "";
  if (res.getsAway) {
    return `⚖️ ${player.name}${tag} WALKS — rolled ${res.roll} ≤ ${g} (${getawayOdds(g)}); ${caseEntry.vendor} debt wiped, ${w(e.civil.legal_fee)} legal fee`;
  }
  player.cash -= caseEntry.amount;
  return `⚖️ ${player.name}${tag} LOSES — rolled ${res.roll} > ${g}; pays ${caseEntry.vendor} ${w(caseEntry.amount)} + ${w(e.civil.legal_fee)} fee`;
}

function tickPlayerWindow(state, player, ap) {
  if (ap.sue_window_remaining === null) {
    ap.sue_window_remaining = state.economy.sue_window;
    return [`${player.name} is late paying ${ap.vendor} — a ${ap.sue_window_remaining}-turn sue window opens`];
  }
  ap.sue_window_remaining -= 1;
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
      player.cash -= total;
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
      player.cash += card.cash ?? 0;
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
      player.cash -= e.civil.legal_fee;
      if (res.getsAway) return [...flavor, `⚖️ ${player.name} was sued (${card.name}) and WALKED (rolled ${res.roll} ≤ ${g}) — ${w(e.civil.legal_fee)} fee`];
      const claim = card.amount ?? 5;
      player.cash -= claim;
      return [...flavor, `⚖️ ${player.name} was sued (${card.name}) and LOST (rolled ${res.roll} > ${g}) — paid ${w(claim)} + ${w(e.civil.legal_fee)} fee`];
    }
    default:
      return [...flavor, `${player.name}: ${card.name} (no effect)`];
  }
}
