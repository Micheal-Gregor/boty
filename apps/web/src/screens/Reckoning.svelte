<script>
  import { ui, reckoningDone } from "../lib/store.js";
  import Shop from "../components/Shop.svelte";

  const s = $derived($ui.view);
  const econ = $derived($ui.economy);
  const me = $derived(s ? s.players[s.activePlayerIndex] : null);
  // My own Last Licks? Computed from the REACTIVE view (meIndex == my seat online, == active locally) so it
  // updates as the live seat advances. (myTurn() alone isn't a reactive dependency, so $derived(myTurn())
  // would go stale and leave the active seat stuck with no "Done" button — the online reckoning freeze.)
  const mine = $derived(!!s && !s.observer && s.activePlayerIndex === s.meIndex);
  const handHas = (type) => me?.hand.some((c) => c.type === type);
</script>

<div class="board reckoning-screen">
  <header class="banner lastlicks">
    <span class="town">🏆 {$ui.flavor?.award ?? "Business of the Year"} — LAST LICKS</span>
    <span class="turn">▶ {me.name}{#if !mine} <span class="muted">— taking their last licks</span>{/if}</span>
  </header>
  <p class="muted lead">The year is up. Empty your hand: rush a job over the line, bury a rival's (spend a
    Favor), collect what you're owed. Then pass it on.</p>

  <div class="columns">
    <section class="panel">
      <!-- Watching another player's Last Licks → grey + lock the sheet, same as a rival's turn on the board. -->
      <div class="sheet-lock" class:locked={!mine}><Shop player={me} {econ} {handHas} nextBuilding={null} /></div>
      {#if $ui.error}<p class="error">✗ {$ui.error}</p>{/if}
      {#if mine}
        <div class="actions">
          <!-- Sabotage now lives on the Favor card (Shop hand → 🪙 Play… → ⚔️ Sabotage); suing is from the
               Lawsuits panel's per-claim Sue buttons. -->
          <button class="end" onclick={reckoningDone}>Done — pass it on ▶</button>
        </div>
        <p class="muted">(Hire / buy / assign are closed — the year's over. Rush, Buy Time, Factor, Pay, Favor-Sabotage and Sue are your last moves.)</p>
      {:else}
        <p class="muted">Watching {me.name} take their last licks…</p>
      {/if}
    </section>
  </div>
</div>
