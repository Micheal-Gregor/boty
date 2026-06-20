<script>
  import { ui, startPick, reckoningDone } from "../lib/store.js";
  import Shop from "../components/Shop.svelte";

  const s = $derived($ui.view);
  const econ = $derived($ui.economy);
  const me = $derived(s ? s.players[s.activePlayerIndex] : null);
  const handHas = (type) => me?.hand.some((c) => c.type === type);
</script>

<div class="board reckoning-screen">
  <header class="banner lastlicks">
    <span class="town">🏆 {$ui.flavor?.award ?? "Business of the Year"} — LAST LICKS</span>
    <span class="turn">▶ {me.name}</span>
  </header>
  <p class="muted lead">The year is up. Empty your hand: rush a job over the line, bury a rival's,
    collect what you're owed. Then pass it on.</p>

  <div class="columns">
    <section class="panel">
      <Shop player={me} {econ} {handHas} nextBuilding={null} />
      {#if $ui.error}<p class="error">✗ {$ui.error}</p>{/if}
      <div class="actions">
        {#if handHas("sabotage")}<button onclick={() => startPick("sabotage")}>⚔️ Sabotage…</button>{/if}
        <button onclick={() => startPick("sue")}>⚖️ Sue…</button>
        <button class="end" onclick={reckoningDone}>Done — pass it on ▶</button>
      </div>
      <p class="muted">(Hire / buy / assign are closed — the year's over. Rush, Buy Time, Factor, Pay, Sabotage and Sue are your last moves.)</p>
    </section>
  </div>
</div>
