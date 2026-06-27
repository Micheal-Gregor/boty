// Currency display. The engine reasons entirely in W (work-units); the UI shows players dollars by
// multiplying by a tunable rate (economy.w_to_usd, default $50/W). A settings toggle flips the whole
// UI back to raw W for balance analysis. `$money(w)` is a reactive formatter — it re-renders every
// amount when you flip the toggle. The rate is set once at load from the economy data.

import { derived } from "svelte/store";
import { settings } from "./settings.js";
import { crewIdentity } from "./crew.js";

let rate = 50;
export function setMoneyRate(r) { if (typeof r === "number" && r > 0) rate = r; }

function fmt(w, mode) {
  if (w == null || Number.isNaN(w)) return mode === "w" ? "— W" : "$—";
  if (mode === "w") return `${w} W`;
  const usd = Math.round(w * rate);
  const sign = usd < 0 ? "-" : "";
  return `${sign}$${Math.abs(usd).toLocaleString("en-US")}`;
}

/** Reactive formatter bound to the current currency mode: $money(120) → "$6,000" or "120 W". */
export const money = derived(settings, ($s) => (w) => fmt(w, $s.currency ?? "usd"));

/** Dollarize engine-written text: turns every cash "N W" into "$N×rate", leaving WORK text alone
 *  ("3 work", "−2 output", "3/7", ⚡ — never written as "N W"). No-op in W mode. Use on log lines,
 *  card effect text, flavor, and alert bodies that the engine produced. */
export const cashText = derived(settings, ($s) => (str) => {
  if (!str) return str;
  // Worker ids (T1, T2…) → their cosmetic crew names (always; the engine only knows the id).
  let out = String(str).replace(/\bT\d+\b/g, (id) => crewIdentity(id).name);
  // Dollarize "N W" → "$N×rate" unless the player chose raw work-units.
  if (($s.currency ?? "usd") !== "w") out = out.replace(/(\d+(?:\.\d+)?) W\b/g, (_, n) => "$" + Math.round(parseFloat(n) * rate).toLocaleString("en-US"));
  return out;
});
