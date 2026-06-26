// Currency display. The engine reasons entirely in W (work-units); the UI shows players dollars by
// multiplying by a tunable rate (economy.w_to_usd, default $50/W). A settings toggle flips the whole
// UI back to raw W for balance analysis. `$money(w)` is a reactive formatter — it re-renders every
// amount when you flip the toggle. The rate is set once at load from the economy data.

import { derived } from "svelte/store";
import { settings } from "./settings.js";

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
