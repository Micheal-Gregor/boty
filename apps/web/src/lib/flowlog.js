// DEV-only game-flow tracer. Emits a compact, greppable `[BOTY:*]` console line on each meaningful state
// change and on key online events (sync received, moves flushed, reckoning steps, AI driving). An
// EXPORTED browser console log then reconstructs the whole playthrough turn-by-turn — and a freeze shows
// up plainly as the point where one tab's timeline stops advancing while the other's keeps going.
//
// To capture: open DevTools → Console on BOTH tabs, play, then right-click the console → "Save as…"
// (or the ⤓ export). Send both files. No-op in a production build.
let lastState = "";
export function flow(tag, snap) {
  if (!import.meta.env?.DEV) return;
  let line;
  try { line = JSON.stringify(snap); } catch { line = String(snap); }
  if (tag === "state") { if (line === lastState) return; lastState = line; } // only log state when it actually CHANGES (no spam)
  try { console.log(`[BOTY:${tag}]`, line); } catch { /* ignore */ }
}
