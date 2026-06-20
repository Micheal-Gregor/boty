<script>
  import { ui, respond } from "../lib/store.js";
  const t = $derived($ui.threat);
</script>

{#if t}
  <div class="overlay">
    <div class="modal threat">
      {#if t.type === "sabotage"}
        <h2>⚔️ {t.targetName}, you're being sabotaged!</h2>
        <p>Your <strong>{t.jobName}</strong> is under attack — a word to the inspector, a bolt left loose.</p>
        <div class="row">
          <button disabled={!t.canCounter} onclick={() => respond({ counter: true })}>🛡️ Counter with Rush</button>
          <button onclick={() => respond({ counter: false })}>Let it land</button>
        </div>
        {#if !t.canCounter}<p class="muted">No Rush in your hand.</p>{/if}
      {:else}
        <h2>⚖️ {t.targetName}, you're being sued for {t.amount} W</h2>
        <p>Match the {t.deposit} W deposit to fight it, or fold and pay.</p>
        <div class="row">
          <button disabled={!t.canAfford} onclick={() => respond({ contest: true })}>Contest ({t.deposit} W)</button>
          {#if t.canLawyer}<button onclick={() => respond({ contest: true, ownLawyer: true })}>Contest + Slick Lawyer</button>{/if}
          <button onclick={() => respond({ contest: false })}>Fold &amp; pay</button>
        </div>
      {/if}
    </div>
  </div>
{/if}
