// The crew-portrait pool, and which face + sex a worker maps to. Shared by Art.svelte (to pick the
// face) and crew.js (to pick a name that MATCHES the face's sex) so the two never disagree.
//
// LABEL A PORTRAIT FEMALE by ending its filename with _f or -f  (e.g. "tp (3)_f.mp4"), or by putting it
// in a crew/f/ sub-folder. Anything else is treated as male — so the default with no label is male.
// (Non-art files in the folder, like .bat scripts, are ignored.)

// Non-eager glob: we only need the file KEYS here (to pick a face / read its label), not the bytes —
// Art.svelte still does the actual asset loading. So this adds no weight to the bundle.
const mods = import.meta.glob("../assets/art/crew/**/*.{png,jpg,jpeg,webp,mp4,webm}");
const keys = new Set();
for (const p of Object.keys(mods)) { const m = p.match(/art\/(crew\/.+)\.[^.]+$/); if (m) keys.add(m[1]); }

export const crewPool = [...keys].sort();          // e.g. ["crew/tp (1)", "crew/tp (2)_f", …]
const present = new Set(crewPool);
const sum = (s) => [...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0); // stable, order-independent

/** The portrait key a worker id uses — an exact crew/<id> file wins; else a stable pooled face. */
export function crewKey(id) {
  const exact = `crew/${id}`;
  if (present.has(exact) || !crewPool.length) return exact;
  return crewPool[sum(id) % crewPool.length];
}

/** The worker's portrait sex: 'f' if its filename is labelled female (…_f / …-f, or under crew/f/),
 *  else 'm' (the default when unlabelled). Names are drawn to match this. */
export function crewSex(id) {
  const k = crewKey(id).toLowerCase();
  return /\/f\//.test(k) || /[ _-]f$/.test(k) ? "f" : "m";
}
