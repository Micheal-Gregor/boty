<script>
  // Front-of-house frame: a full-screen background (drop art at art/screen/<bg>.{png,mp4}) under a
  // dark scrim, with the page content centered on top. Until you drop a background, a Maple-Hollow
  // dusk gradient stands in.
  import Art from "../components/Art.svelte";
  // `framed` (loading / gala): on a wide screen, present in a centered portrait column so portrait-
  // composed art shows in full instead of being cropped edge-to-edge. Mobile is unchanged.
  let { bg = "menu", label = "Maple Hollow", loopFrom = 0, framed = false, children } = $props();
</script>

<section class="shell" class:framed>
  <div class="shell-bg"><Art kind="screen" id={bg} {label} autoplay animatable={false} {loopFrom} /></div>
  <div class="shell-scrim"></div>
  <div class="shell-body">{@render children()}</div>
</section>

<style>
  /* display:flex + margin:auto on the body centers SHORT pages but lets TALL ones scroll from the
     top (align-items:center would strand the top of an overflowing page off-screen). */
  .shell { position: fixed; inset: 0; overflow: auto; display: flex; }
  .shell-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
  /* cover the viewport whatever the aspect ratio; the placeholder becomes a clean dusk gradient */
  .shell-bg :global(.art-anim) { position: absolute; inset: 0; } /* the video WRAPPER must fill, or it collapses to 0×0 */
  .shell-bg :global(img), .shell-bg :global(video) { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .shell-bg :global(.art-slot) { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; color: transparent; background: radial-gradient(120% 100% at 50% 0%, #2a3550 0%, #161a22 55%, #0d0f14 100%); }
  .shell-scrim { position: fixed; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.65)); }
  .shell-body { position: relative; z-index: 2; margin: auto; box-sizing: border-box; width: 100%; max-width: 720px; padding: 28px 20px; }
  /* Framed (loading / gala): on a wide screen, centre everything in a ~540px portrait column with a
     dark surround, so portrait-composed art reads in full instead of being cropped edge-to-edge. The
     soft shadow blends the column into the gutter. Phones (< 820px) stay full-bleed. */
  @media (min-width: 820px) {
    .shell.framed { background: radial-gradient(135% 100% at 50% -8%, #232c42 0%, #0d0f14 66%); }
    .shell.framed .shell-bg, .shell.framed .shell-scrim { left: 50%; right: auto; width: min(540px, 100%); transform: translateX(-50%); }
    .shell.framed .shell-bg { box-shadow: 0 0 80px 24px rgba(0,0,0,0.55); }
    .shell.framed .shell-body { max-width: 540px; }
  }
</style>
