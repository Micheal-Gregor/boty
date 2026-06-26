<script module>
  // The Grok asset pipeline: drop a STILL at `src/assets/art/<kind>/<id>.{png,jpg,webp,svg}` and/or
  // an ANIMATION at `src/assets/art/<kind>/<id>.{mp4,webm}` and it appears automatically — no code
  // change. The animation's first frame IS the still (used as the video poster). Until any asset
  // exists, a labeled placeholder slot shows (which doubles as the shot-list for the artist).
  const imgMods = import.meta.glob("../assets/art/**/*.{png,jpg,jpeg,webp,svg}", { eager: true, query: "?url", import: "default" });
  const vidMods = import.meta.glob("../assets/art/**/*.{mp4,webm}", { eager: true, query: "?url", import: "default" });
  const build = (mods) => {
    const out = {};
    for (const [path, url] of Object.entries(mods)) { const m = path.match(/art\/(.+)\.[^.]+$/); if (m) out[m[1]] = url; }
    return out;
  };
  const stills = build(imgMods);
  const anims = build(vidMods);

  // The crew is a POOL: drop any number of portraits in art/crew/ (named anything) and each worker
  // is assigned a stable one by hashing its id — so ~20 faces cover a whole table, and a worker keeps
  // the same face all game. An exact crew/<id> file still wins if you ever want to pin one.
  const crewPool = [...new Set([...Object.keys(stills), ...Object.keys(anims)].filter((k) => k.startsWith("crew/")))].sort();
  export function crewKey(id) {
    const exact = `crew/${id}`;
    if (stills[exact] || anims[exact] || !crewPool.length) return exact;
    const h = [...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0);
    return crewPool[h % crewPool.length];
  }

  const has = (k) => !!(stills[k] || anims[k]);
  const allArtKeys = [...new Set([...Object.keys(stills), ...Object.keys(anims)])];
  const hashStr = (s) => [...String(s)].reduce((a, c) => (a + c.charCodeAt(0)) >>> 0, 0);
  // Pick one file from a folder pool (files directly under <prefix>/), stable for a given seed.
  function poolUnder(prefix, seed) {
    const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^/]+$`);
    const pool = allArtKeys.filter((k) => re.test(k)).sort();
    return pool.length ? pool[hashStr(seed) % pool.length] : null;
  }
  // Equipment art: a POOL folder (equipment/basic/* or equipment/pro/<trade>/*) picked stably per
  // rig; else a single file (equipment/basic.* or equipment/pro/<trade>.*); else a generic pro.*.
  export function equipKey(id, seed = "") {
    const fromPool = poolUnder(`equipment/${id}`, seed);
    if (fromPool) return fromPool;
    if (has(`equipment/${id}`)) return `equipment/${id}`;
    if (id.startsWith("pro/") && has("equipment/pro")) return "equipment/pro";
    return `equipment/${id}`;
  }
  // Turn-start town life: a random scene from art/townlife/<season>/ (or a flat townlife/ pool).
  // Returns the id AFTER "townlife/" (e.g. "spring/fair"), or null if none dropped yet.
  export function townlifeId(season) {
    const all = [...new Set([...Object.keys(stills), ...Object.keys(anims)].filter((k) => k.startsWith("townlife/")))];
    if (!all.length) return null;
    const seasonal = all.filter((k) => k.startsWith(`townlife/${season}/`));
    const pool = seasonal.length ? seasonal : all;
    return pool[Math.floor(Math.random() * pool.length)].replace(/^townlife\//, "");
  }
</script>

<script>
  // `autoplay` — start the animation on open (round intro & your cards when "Animate cards" is on).
  // `animatable` — allow click-to-play (off for, e.g., tiny shop thumbnails). Still-only assets and
  // placeholders never animate.
  // `loopFrom` (seconds) — play the clip through ONCE start-to-end, then loop only the tail from that
  // mark (e.g. loopFrom={6} skips a 6s Grok intro on every repeat). 0 = ordinary full loop.
  let { kind = "cards", id = "", label = "", small = false, autoplay = false, animatable = true, seed = "", loopFrom = 0 } = $props();
  const akey = $derived(kind === "crew" ? crewKey(id) : kind === "equipment" ? equipKey(id, seed) : `${kind}/${id}`);
  const still = $derived(stills[akey]);
  const anim = $derived(anims[akey]);

  let vid = $state(null);
  let playing = $state(false);
  let soundOn = $state(false);

  $effect(() => { if (vid && autoplay && anim) play(); });

  function play() { if (!vid) return; vid.muted = !soundOn; vid.play().then(() => (playing = true)).catch(() => {}); }
  function toggle() {
    if (!anim || !animatable || !vid) return;
    if (playing) { vid.pause(); playing = false; } else { play(); }
  }
  function toggleSound(e) { e.stopPropagation(); soundOn = !soundOn; if (vid) vid.muted = !soundOn; }
  // Custom tail-loop: when loopFrom is set the video isn't natively looped, so it fires `ended` after
  // the full first pass — we then seek to loopFrom and replay, repeating only the tail thereafter.
  function onEnded() { if (loopFrom && vid) { vid.currentTime = loopFrom; vid.play().catch(() => {}); } }
</script>

{#if anim}
  <div class="art-anim" class:sm={small} class:playable={animatable} onclick={toggle} role="button" tabindex="0">
    <video bind:this={vid} class="art-vid" class:sm={small} poster={still} loop={!loopFrom} onended={onEnded} playsinline preload="metadata" muted>
      <source src={anim} />
    </video>
    {#if animatable}
      <button class="snd" title={soundOn ? "sound on" : "sound off"} onclick={toggleSound}>{soundOn ? "🔊" : "🔇"}</button>
      {#if !playing}<span class="play-hint">▶</span>{/if}
    {/if}
  </div>
{:else if still}
  <img class="art-img" class:sm={small} src={still} alt={label} />
{:else}
  <div class="art-slot" class:sm={small}>[art: {label}]</div>
{/if}

<style>
  .art-anim { position: relative; line-height: 0; cursor: default; }
  .art-anim.playable { cursor: pointer; }
  .art-vid { width: 100%; display: block; border-radius: inherit; }
  .snd { position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.5); border: none; border-radius: 50%; width: 28px; height: 28px; font-size: 0.9em; cursor: pointer; }
  .play-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 2em; color: rgba(255,255,255,0.85); text-shadow: 0 1px 4px rgba(0,0,0,0.6); pointer-events: none; }
</style>
