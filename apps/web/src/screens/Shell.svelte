<script>
  // Front-of-house frame: a full-screen background (drop art at art/screen/<bg>.{png,mp4}) under a
  // dark scrim, with the page content centered on top. Until you drop a background, a Maple-Hollow
  // dusk gradient stands in.
  import Art from "../components/Art.svelte";
  let { bg = "menu", label = "Maple Hollow", children } = $props();
</script>

<section class="shell">
  <div class="shell-bg"><Art kind="screen" id={bg} {label} autoplay /></div>
  <div class="shell-scrim"></div>
  <div class="shell-body">{@render children()}</div>
</section>

<style>
  .shell { position: fixed; inset: 0; overflow: auto; display: flex; align-items: center; justify-content: center; }
  .shell-bg { position: fixed; inset: 0; z-index: 0; }
  /* cover the viewport whatever the aspect ratio; the placeholder becomes a clean dusk gradient */
  .shell-bg :global(img), .shell-bg :global(video) { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .shell-bg :global(.art-slot) { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; color: transparent; background: radial-gradient(120% 100% at 50% 0%, #2a3550 0%, #161a22 55%, #0d0f14 100%); }
  .shell-scrim { position: fixed; inset: 0; z-index: 1; background: linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.65)); }
  .shell-body { position: relative; z-index: 2; width: 100%; max-width: 720px; padding: 28px 20px; }
</style>
