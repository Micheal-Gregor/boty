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
        <p>Defend the case — you <strong>walk on a 1–3 (50%)</strong>, and a Slick Lawyer pushes
          that to 1–5. Win → the debt stands; lose → you pay {t.amount} W. Defending costs a
          1 W legal fee. Or fold and just pay.</p>
        <div class="row">
          <button onclick={() => respond({ contest: true })}>Defend</button>
          {#if t.canLawyer}<button onclick={() => respond({ contest: true, ownLawyer: true })}>🧑‍⚖️ Defend + Slick Lawyer</button>{/if}
          <button onclick={() => respond({ contest: false })}>Fold &amp; pay</button>
        </div>
      {/if}
    </div>
  </div>
{/if}
