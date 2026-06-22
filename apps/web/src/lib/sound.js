// Sound pipeline — the audio twin of the Art-by-id system. Drop a file at
// `src/assets/sound/{sfx,music}/<id>.{mp3,ogg,m4a,wav}` and it plays; until then every call is a
// SILENT no-op, so the game runs identically with or without audio. Honours a persisted mute
// toggle and the browser's autoplay gate (audio "unlocks" on the first user gesture — the
// Start button — after which sfx and the seasonal music loop are allowed to sound).

import { writable } from "svelte/store";
import { settings } from "./settings.js";

// Settings gate the sound/music independently of the quick mute toggle.
let sfxOn = true, musicOn = true;

const files = import.meta.glob("../assets/sound/**/*.{mp3,ogg,m4a,wav}", {
  eager: true, query: "?url", import: "default",
});
const lookup = {};
for (const [path, url] of Object.entries(files)) {
  const m = path.match(/sound\/(.+)\.[^.]+$/); // "sfx/deal", "music/spring"
  if (m) lookup[m[1]] = url;
}

const KEY = "boty-muted";
const stored = (() => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } })();

export const muted = writable(stored);
let isMuted = stored;
let unlocked = false;
let musicEl = null;
let musicId = null;

muted.subscribe((v) => {
  isMuted = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ }
  if (v) {
    if (musicEl) { try { musicEl.pause(); } catch { /* ignore */ } }
  } else if (musicId) {
    const id = musicId; musicId = null; playMusic(id); // resume the current loop
  }
});

export function toggleMute() { muted.update((v) => !v); }

settings.subscribe((s) => {
  sfxOn = s.sound; musicOn = s.music;
  if (!musicOn && musicEl) { try { musicEl.pause(); } catch { /* ignore */ } }
  else if (musicOn && musicId && !isMuted) { const id = musicId; musicId = null; playMusic(id); }
});

/** Called on the first user gesture (the Start button) so the browser lets us make sound. */
export function unlockAudio() { unlocked = true; }

/** Play a one-shot effect by id (e.g. "deal", "flip", "gavel", "click"). No-op if absent/muted. */
export function playSfx(id, vol = 0.5) {
  if (isMuted || !sfxOn || !unlocked) return;
  const url = lookup[`sfx/${id}`];
  if (!url) return;
  try { const a = new Audio(url); a.volume = vol; a.play().catch(() => {}); } catch { /* ignore */ }
}

/** Loop a music track by id (e.g. a season). Switches smoothly when the id changes. */
export function playMusic(id, vol = 0.28) {
  if (!unlocked || !id || !musicOn) return;
  if (musicId === id && musicEl) return; // already on this track
  const url = lookup[`music/${id}`];
  musicId = id;
  if (musicEl) { try { musicEl.pause(); } catch { /* ignore */ } musicEl = null; }
  if (!url || isMuted) return; // remember intent (musicId) but stay silent
  try {
    musicEl = new Audio(url);
    musicEl.loop = true;
    musicEl.volume = vol;
    musicEl.play().catch(() => {});
  } catch { /* ignore */ }
}

export function stopMusic() {
  if (musicEl) { try { musicEl.pause(); } catch { /* ignore */ } musicEl = null; }
  musicId = null;
}
