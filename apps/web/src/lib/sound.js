// Sound pipeline — the audio twin of the Art-by-id system. Drop a file at
// `src/assets/sound/{sfx,music}/<id>.{mp3,ogg,m4a,wav}` and it plays; until then every call is a
// SILENT no-op, so the game runs identically with or without audio. Honours a persisted mute
// toggle and the browser's autoplay gate (audio "unlocks" on the first user gesture — the
// Start button — after which sfx and the seasonal music loop are allowed to sound).

import { writable } from "svelte/store";
import { settings } from "./settings.js";

// Settings gate the sound/music independently of the quick mute toggle.
let sfxOn = true, musicOn = true, masterVol = 0.7;
let musicBaseVol = 0.28; // the per-track base, scaled by masterVol

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
let musicId = null;      // the track currently loaded (a season theme, a jukebox song, intro, gala)
let musicLoop = false;   // does the current track loop on its own?
let musicMode = "idle";  // "idle" | "loop" (intro/gala) | "season" (theme → shuffled jukebox)
let seasonId = null;     // the season whose theme anchors the current jukebox run
let queue = [];          // remaining shuffled jukebox ids for this run

// Every file dropped in sound/music/jukebox/ joins the shuffle that plays after each season theme.
// Add as many as you like — they're picked up automatically, no code change.
const jukeboxIds = Object.keys(lookup).filter((k) => k.startsWith("music/jukebox/")).map((k) => k.slice("music/".length));
function shuffle(a) { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; }

muted.subscribe((v) => {
  isMuted = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch { /* private mode */ }
  if (v) { if (musicEl) { try { musicEl.pause(); } catch { /* ignore */ } } }
  else resumeMusic(); // un-muted → pick the current intent back up
});

export function toggleMute() { muted.update((v) => !v); }

settings.subscribe((s) => {
  sfxOn = s.sound; musicOn = s.music;
  masterVol = typeof s.volume === "number" ? Math.max(0, Math.min(1, s.volume)) : 0.7;
  if (musicEl) musicEl.volume = musicBaseVol * masterVol; // live-adjust the track as the slider moves
  if (!musicOn && musicEl) { try { musicEl.pause(); } catch { /* ignore */ } }
  else if (musicOn && !isMuted) resumeMusic();
});

/** Called on the first user gesture (the Start button) so the browser lets us make sound. */
export function unlockAudio() { unlocked = true; resumeMusic(); }

/** Play a one-shot effect by id (e.g. "deal", "flip", "gavel", "click"). No-op if absent/muted. */
export function playSfx(id, vol = 0.5) {
  if (isMuted || !sfxOn || !unlocked) return;
  const url = lookup[`sfx/${id}`];
  if (!url) return;
  try { const a = new Audio(url); a.volume = Math.max(0, Math.min(1, vol * masterVol)); a.play().catch(() => {}); } catch { /* ignore */ }
}

/** A "sting" — a short dramatic clip that DUCKS the music for ~1.6s so it cuts through, then the
 *  loop swells back. Punctuates big beats (a levy, a fine, a called loan, a bankruptcy). No-op (and
 *  no duck) until the clip exists, so it's safe to wire before the audio lands. */
export function playSting(id, vol = 0.7) {
  if (isMuted || !sfxOn || !unlocked) return;
  if (!lookup[`sfx/${id}`]) return; // no clip yet → don't duck the music for silence
  if (musicEl) {
    try { musicEl.volume = musicBaseVol * masterVol * 0.2; } catch { /* ignore */ }
    setTimeout(() => { try { if (musicEl) musicEl.volume = musicBaseVol * masterVol; } catch { /* ignore */ } }, 1600);
  }
  playSfx(id, vol);
}

// Low-level: load and play one track. A non-looping track in season mode chains to the next song.
function spin(id, loop) {
  musicId = id; musicLoop = loop;
  if (musicEl) { try { musicEl.pause(); musicEl.onended = null; } catch { /* ignore */ } musicEl = null; }
  const url = id && lookup[`music/${id}`];
  if (!url || isMuted || !musicOn || !unlocked) return; // keep the intent; stay silent for now
  try {
    musicEl = new Audio(url);
    musicEl.loop = loop;
    musicEl.volume = Math.max(0, Math.min(1, musicBaseVol * masterVol));
    if (!loop) musicEl.onended = onTrackEnd;
    musicEl.play().catch(() => {});
  } catch { /* ignore */ }
}

function onTrackEnd() { if (musicMode === "season") nextInQueue(); }

// Play the next jukebox song; reshuffle when the run is spent; loop the theme if there's no jukebox.
function nextInQueue() {
  if (musicMode !== "season") return;
  if (!jukeboxIds.length) { spin(seasonId, true); return; } // no extra songs → just loop the theme
  if (!queue.length) queue = shuffle(jukeboxIds);
  spin(queue.shift(), false);
}

// Resume whatever was intended after an unmute / music-on / autoplay-unlock.
function resumeMusic() {
  if (isMuted || !musicOn || !unlocked) return;
  if (musicMode === "season") spin(musicId ?? seasonId, musicLoop); // replay current track; chain continues
  else if (musicMode === "loop" && musicId) spin(musicId, true);
}

/** Loop a single track by id — the front-of-house themes (intro, gala). */
export function playMusic(id, vol = 0.28) {
  if (!id) return;
  if (musicMode === "loop" && musicId === id && musicEl) return; // already on it
  musicMode = "loop"; seasonId = null; queue = []; musicBaseVol = vol;
  spin(id, true);
}

/** Play a season's theme once, then shuffle through the jukebox queue until the season changes. */
export function playSeasonMusic(season, vol = 0.28) {
  if (!season) return;
  if (musicMode === "season" && seasonId === season) return; // already running this season
  musicMode = "season"; seasonId = season; queue = []; musicBaseVol = vol;
  spin(season, false); // theme once → onTrackEnd → jukebox
}

export function stopMusic() {
  if (musicEl) { try { musicEl.pause(); musicEl.onended = null; } catch { /* ignore */ } musicEl = null; }
  musicId = null; musicMode = "idle"; seasonId = null; queue = [];
}
