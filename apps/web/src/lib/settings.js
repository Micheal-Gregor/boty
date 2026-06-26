// Player settings — sound/music, which rival cards pop up, and auto-close. Persisted to
// localStorage so they survive a reload. (E5 §3.)

import { writable } from "svelte/store";

const KEY = "boty.settings";
const DEFAULTS = {
  sound: true,
  music: true,
  volume: 0.7, // master level (0–1) scaling every sfx + the music loop
  rivalPopups: "interesting", // "interesting" | "all" | "none"
  autoClose: false, // auto-dismiss your own card pop-ups after a beat
  animateCards: false, // auto-play your card animations on open (else open as a still; click to play)
  confirmEndTurn: true, // a safety-check confirm before ending your turn (off = quick end)
  currency: "usd", // "usd" shows players dollars (W × rate); "w" shows raw work-units for balance analysis
};

function load() {
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings = writable(load());
settings.subscribe((v) => {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
});

export function setSetting(key, value) {
  settings.update((s) => ({ ...s, [key]: value }));
}
