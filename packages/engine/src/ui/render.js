// Open-books rendering. Everyone's ledger is visible (the whole point — the pressure is
// social). These helpers turn state into terminal text; they never mutate anything.

import { findBuilding, findEquipment, w } from "../engine/economy.js";
import { overheadFor } from "../engine/turn.js";
import { seasonFor } from "../engine/season.js";

export { seasonFor }; // re-exported so the CLI can keep importing it from here

export function renderPlayer(state, player, { active = false } = {}) {
  const building = findBuilding(state.economy, player.building);
  const marker = active ? "▶ " : "  ";
  const status = player.bankrupt ? " 💀 BANKRUPT" : "";
  const o = overheadFor(state, player);

  const equip = player.equipment.length
    ? player.equipment
        .map((e) => {
          const def = findEquipment(state.economy, e.defId);
          return `${e.id}:${def.name}[${e.owned ? "owned" : "rented"}]`;
        })
        .join(", ")
    : "none";

  const lines = [
    `${marker}${player.name} (${player.service})${status}`,
    `    cash ${w(player.cash)}  |  ${building.name} (tier ${building.tier ?? 1}, cap ${building.capacity})  |  overhead ${w(o.total)}/turn`,
    `    tradespeople: ${player.tradesmen.length} (${player.tradesmen.map((t) => describeTradesman(t)).join(", ") || "—"})`,
    `    equipment: ${equip}`,
  ];
  if (player.jobs.length) {
    lines.push(`    jobs:`);
    for (const j of player.jobs) lines.push(`      ${describeJob(state, j)}`);
  }
  if (player.invoices.length) {
    const inv = player.invoices.map((i) => `${i.id}:${w(i.amount)}@t${i.due_turn}`).join(", ");
    lines.push(`    invoices (AR): ${inv}`);
  }
  if (player.payables.length) {
    const ap = player.payables.map((a) => {
      const who = a.is_npc ? a.vendor : `${a.vendor}→P`;
      const win = a.sue_window_remaining != null ? ` sue:${a.sue_window_remaining}` : "";
      return `${a.id}:${w(a.amount)}@t${a.due_turn}${a.turns_dodged ? ` dodged×${a.turns_dodged}` : ""}${win} (${who})`;
    }).join(", ");
    lines.push(`    payables (AP): ${ap}`);
  }
  if (player.hand.length) {
    lines.push(`    hand: ${player.hand.map((c) => c.name).join(", ")} (playable in Stage 4)`);
  }
  return lines.join("\n");
}

function describeTradesman(t) {
  return t.assignedJob ? `${t.id}→${t.assignedJob}` : `${t.id}·idle`;
}

function describeJob(state, j) {
  const remaining = j.deadline_turn - state.turn;
  const due = remaining < 0 ? "OVERDUE" : `due in ${remaining}`;
  const crew = `${j.assigned_tradesmen.length}/${j.max_tradesmen}` + (j.min_tradesmen > 1 ? ` (min ${j.min_tradesmen})` : "");
  const reqs = [
    j.required_equipment ? `needs ${j.required_equipment}` : null,
    j.required_building_tier > 1 ? `tier-${j.required_building_tier} shop` : null,
    j.equipment_per_tradesman ? "a tool/worker" : null,
  ].filter(Boolean);
  const gate = reqs.length ? ` ⟨${reqs.join(", ")}⟩` : "";
  const sticky = j.droppable ? "" : " ⚲sticky";
  return `${j.id} ${j.name} [${j.state}] ${j.work_done}/${j.work_amount} work · ${w(j.value)} · ${due} · crew ${crew}${gate}${sticky}`;
}

export function renderTable(state) {
  const s = seasonFor(state);
  const town = state.flavor?.town ? `${state.flavor.town} · ` : "";
  const header = `── ${town}${s.name} · round ${state.turn} of ${state.economy.max_turns} ──`;
  const rows = state.players
    .map((p, i) => renderPlayer(state, p, { active: i === state.activePlayerIndex && !state.over }))
    .join("\n");
  return `${header}\n${rows}`;
}

export function renderResults(standings, flavor = null) {
  const bureau = flavor?.bureau ?? "the Better Business Bureau";
  const award = flavor?.award ?? "Business of the Year";
  const town = flavor?.town ?? "town";
  const lines = ["", `═══ THE ${award.toUpperCase()} GALA ═══`, `  ${bureau} reviews the year's open books…`, ""];
  for (const s of standings) {
    const tag = s.bankrupt ? "shuttered (bankrupt)" : `${w(s.cash)} in the bank`;
    lines.push(`  ${s.place}. ${s.name} (${s.service}) — ${tag}`);
  }
  const winner = standings.find((s) => !s.bankrupt);
  lines.push("", winner
    ? `🏆 ${winner.name} is named ${town}'s ${award} with ${w(winner.cash)}!`
    : `Every shop in ${town} went under. The ${award} goes unawarded this year.`);
  return lines.join("\n");
}
