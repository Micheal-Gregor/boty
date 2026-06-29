// Code violations / defects (Pass 2d). A drawn defect sits on your shop and bites every turn —
// a small fine at upkeep plus a drag on how fast your crew burns work — until you pay to fix it.
// Fixing clears it immediately but books the repair as a PAYABLE due later: routed to a
// tradesperson at the table when the defect needs a trade you lack (their AR), else an NPC
// permit-and-materials bill. So a defect is a deferred-maintenance decision: bleed now, or take
// on a fix-AP that itself flows into the table's AR/AP web.

import { GameError, w } from "./economy.js";
import { createPayable } from "../state/state.js";
import { cashOut, ACCT } from "../state/ledger.js";
import { incurPayable } from "./payables.js";

/** Total work-per-turn your unfixed defects drag off your active jobs. */
export function defectPenalty(player) {
  return player.defects.reduce((sum, d) => sum + (d.productivity_hit ?? 0), 0);
}

/** Upkeep: charge each unfixed defect's fine. Returns log lines (cash drain can bankrupt). */
export function tickDefects(state, player) {
  const lines = [];
  for (const d of player.defects) {
    cashOut(state, player, ACCT.LICENSES, d.fine, `${d.name} fine`);
    lines.push(`🚧 ${player.name}: ${d.name} unfixed — ${w(d.fine)} fine, −${d.productivity_hit} output until repaired`);
  }
  return lines;
}

/** A solvent other player who can do the repair trade. */
function pickFixer(state, player, trade) {
  return state.players.find((p) => p !== player && !p.bankrupt && p.service === trade) ?? null;
}

/**
 * Fix a defect: clears the productivity drag + fine now, and books the repair cost as a payable
 * due `fix_terms` turns out. Routed to a tradesperson (their AR) when the defect needs a trade
 * you lack and someone has it; otherwise an NPC permit/materials bill.
 */
export function fixDefect(state, player, defectId) {
  const i = player.defects.findIndex((d) => d.id === defectId);
  if (i < 0) throw new GameError(`No defect "${defectId}" on ${player.name}'s shop`);
  const d = player.defects[i];
  const dueTurn = state.turn + d.fix_terms;
  let line;
  if (d.fix_trade && player.service !== d.fix_trade) {
    const fixer = pickFixer(state, player, d.fix_trade);
    if (fixer) {
      player.payables.push(createPayable({ vendor: `${fixer.name} (fixed ${d.name})`, amount: d.fix_cost, dueTurn, isNpc: false, creditorId: fixer.id }));
      line = `🔧 ${player.name} hired ${fixer.name} (the ${d.fix_trade}) to clear ${d.name} — owes ${w(d.fix_cost)} due turn ${dueTurn}`;
    }
  }
  if (!line) {
    const permit = Math.min(state.economy.permit_fee ?? 2, d.fix_cost);
    const materials = d.fix_cost - permit;
    const debits = [];
    if (permit > 0) debits.push({ acct: ACCT.PERMITS, amt: permit }); // permits → their own overhead line
    if (materials > 0) debits.push({ acct: ACCT.COGS_MATERIALS, amt: materials }); // materials → COGS
    incurPayable(state, player, { vendor: `${d.name} permit & materials`, amount: d.fix_cost, dueTurn, isNpc: true, memo: `${d.name} — permit & materials`, debits });
    line = `🔧 ${player.name} cleared ${d.name} — a ${w(d.fix_cost)} permit & materials bill (Dr Permits ${w(permit)} + Materials ${w(materials)} / Cr AP), due turn ${dueTurn}`;
  }
  player.defects.splice(i, 1);
  return line;
}
