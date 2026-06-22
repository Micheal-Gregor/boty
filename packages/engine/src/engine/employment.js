// Employment relations — performance reviews and the four firing scenarios. Mirroring real life:
// letting someone go carries wrongful-termination risk that scales with how defensible the firing
// is. The FIRING PLAYER rolls the dice (no NPC ever rolls); a Slick Lawyer YOU play shifts the odds,
// a Unionized town shifts them the other way.

import { GameError, w } from "./economy.js";
import { cashOut, ACCT } from "../state/ledger.js";
import { releaseTradesman } from "./jobs.js";
import { autoAssignTools } from "./shop.js";

const isSick = (t, turn) => t.out_until != null && t.out_until > turn;
export const unionActive = (state) => (state.globalEffects ?? []).some((e) => e.kind === "union");

/**
 * Classify a firing. Priority: grounds (a flag) make it the safest; otherwise firing someone who's
 * out sick is PUNITIVE (worst); otherwise laying off while you still have unallocated work is a
 * pretextual no-cause; otherwise it's a clean layoff (no claim).
 */
export function classifyTermination(state, player, t) {
  const term = state.economy.termination;
  if (t.flag) return { kind: "with cause", threshold: term.cause, reason: t.flag };
  if (isSick(t, state.turn)) return { kind: "punitive", threshold: term.punitive };
  const hasWork = player.jobs.some((j) => ["Queued", "OnHold", "Active"].includes(j.state));
  if (hasWork) return { kind: "no cause", threshold: term.nocause };
  return { kind: "legit", threshold: 0 };
}

function removeWorker(state, player, t) {
  if (t.assignedJob != null) releaseTradesman(state, player, t.id);
  for (const e of player.equipment) if (e.assigned_to === t.id) e.assigned_to = null;
  player.tradesmen = player.tradesmen.filter((x) => x.id !== t.id);
  autoAssignTools(player);
}

/** Fire a worker: classify, then the firing player rolls the wrongful-termination dice. */
export function fireWorker(state, player, tradesmanId, { ownLawyer = false } = {}) {
  const t = tradesmanId ? player.tradesmen.find((x) => x.id === tradesmanId) : player.tradesmen[player.tradesmen.length - 1];
  if (!t) throw new GameError(`No tradesperson "${tradesmanId}" to fire`);
  const term = state.economy.termination;
  const c = classifyTermination(state, player, t);
  removeWorker(state, player, t);

  if (c.kind === "legit") return `${player.name} laid off ${t.id} — no work for them, no claim`;

  let threshold = c.threshold + (unionActive(state) ? term.union_shift : 0) - (ownLawyer ? term.lawyer_shift : 0);
  threshold = Math.max(0, Math.min(6, threshold));
  const tag = `${c.kind}${c.reason ? ` (${c.reason})` : ""}`;

  const sueRoll = state.die();
  if (sueRoll > threshold) return `⚖️ ${player.name} fired ${t.id} [${tag}] — rolled ${sueRoll}, they let it go`;
  cashOut(state, player, ACCT.LEGAL, term.court_fee, `${t.id} wrongful-termination — court fee`);
  const winRoll = state.die();
  if (winRoll > threshold) return `⚖️ ${player.name} fired ${t.id} [${tag}] — sued (rolled ${sueRoll}) but lost in court (rolled ${winRoll}); ${player.name} pays the ${w(term.court_fee)} fee`;
  cashOut(state, player, ACCT.LEGAL, term.award, `${t.id} wins wrongful-termination`);
  return `⚖️ ${player.name} fired ${t.id} [${tag}] — they SUED AND WON (rolled ${winRoll}); ${player.name} pays ${w(term.award)} + the ${w(term.court_fee)} fee`;
}

/**
 * A performance review: each of the player's crew is reviewed (the player rolls). 1–2 poor (−1 and
 * flagged, giving you cause to fire), 3–4 steady, 5–6 a standout (+1). Resets a stale poor flag.
 */
export function performanceReview(state, player) {
  const lines = [];
  for (const t of player.tradesmen) {
    const r = state.die();
    if (r <= 2) { t.prod_mod = -1; if (t.flag !== "theft") t.flag = "poor_review"; lines.push(`📋 ${t.id} reviewed POORLY (rolled ${r}) — −1 output, on notice`); }
    else if (r >= 5) { t.prod_mod = 1; if (t.flag === "poor_review") t.flag = null; lines.push(`📋 ${t.id} reviewed GREAT (rolled ${r}) — +1 output`); }
    else { t.prod_mod = 0; if (t.flag === "poor_review") t.flag = null; lines.push(`📋 ${t.id} reviewed steady (rolled ${r})`); }
  }
  return lines.length ? lines : [`📋 ${player.name} has no crew to review`];
}
