<script module>
  // The Grok asset pipeline: drop an image at `src/assets/art/<kind>/<id>.{png,jpg,webp,svg}`
  // and it appears automatically — no code change. Until then, a labeled placeholder slot
  // shows (which doubles as the shot-list for the artist).
  const mods = import.meta.glob("../assets/art/**/*.{png,jpg,jpeg,webp,svg}", {
    eager: true, query: "?url", import: "default",
  });
  // Key by the FULL sub-path under art/ so nested kinds work:
  //   art/town/spring/mainst.webp        → "town/spring/mainst"
  //   art/shop/plumber/garage.webp       → "shop/plumber/garage"
  //   art/card/code_violation.webp       → "card/code_violation"
  const lookup = {};
  for (const [path, url] of Object.entries(mods)) {
    const m = path.match(/art\/(.+)\.[^.]+$/);
    if (m) lookup[m[1]] = url;
  }
</script>

<script>
  let { kind = "cards", id = "", label = "", small = false } = $props();
  const src = $derived(lookup[`${kind}/${id}`]);
</script>

{#if src}
  <img class="art-img" class:sm={small} {src} alt={label} />
{:else}
  <div class="art-slot" class:sm={small}>[art: {label}]</div>
{/if}
