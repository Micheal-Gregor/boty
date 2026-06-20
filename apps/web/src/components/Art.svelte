<script module>
  // The Grok asset pipeline: drop an image at `src/assets/art/<kind>/<id>.{png,jpg,webp,svg}`
  // and it appears automatically — no code change. Until then, a labeled placeholder slot
  // shows (which doubles as the shot-list for the artist).
  const mods = import.meta.glob("../assets/art/**/*.{png,jpg,jpeg,webp,svg}", {
    eager: true, query: "?url", import: "default",
  });
  const lookup = {};
  for (const [path, url] of Object.entries(mods)) {
    const m = path.match(/art\/([^/]+)\/([^/.]+)\./);
    if (m) lookup[`${m[1]}/${m[2]}`] = url;
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
