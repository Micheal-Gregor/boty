<script>
  import { ui, restart } from "../lib/store.js";
  const results = $derived($ui.final?.results ?? []);
  const award = $derived($ui.flavor?.award ?? "Business of the Year");
  const town = $derived($ui.flavor?.town ?? "town");
  const winner = $derived(results.find((r) => !r.bankrupt));
</script>

<section class="gala">
  <h1>🏆 The {award} Gala</h1>
  <p class="muted">{$ui.flavor?.bureau ?? "The Better Business Bureau"} reviews the year's open books…</p>

  <ol class="standings">
    {#each results as r}
      <li class:winner={r === winner} class:bankrupt={r.bankrupt}>
        <span class="place">{r.place}</span>
        <span class="who">{r.name} <span class="muted">· {r.service}</span></span>
        <span class="cash">{r.bankrupt ? "shuttered" : r.cash + " W"}</span>
      </li>
    {/each}
  </ol>

  {#if winner}
    <p class="crown">🏆 <strong>{winner.name}</strong> is named {town}'s {award} with {winner.cash} W!</p>
  {:else}
    <p class="crown">Every shop went under. The {award} goes unawarded this year.</p>
  {/if}

  <button class="start" onclick={restart}>New game</button>
</section>
