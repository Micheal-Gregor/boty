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
</script>

<script>
  // `autoplay` — start the animation on open (round intro & your cards when "Animate cards" is on).
  // `animatable` — allow click-to-play (off for, e.g., tiny shop thumbnails). Still-only assets and
  // placeholders never animate.
  let { kind = "cards", id = "", label = "", small = false, autoplay = false, animatable = true } = $props();
  const still = $derived(stills[`${kind}/${id}`]);
  const anim = $derived(anims[`${kind}/${id}`]);

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
</script>

{#if anim}
  <div class="art-anim" class:sm={small} class:playable={animatable} onclick={toggle} role="button" tabindex="0">
    <video bind:this={vid} class="art-vid" class:sm={small} poster={still} loop playsinline preload="metadata" muted>
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
