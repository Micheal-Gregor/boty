<script>
  // A folded shop's lawsuit, handed to the bank/bankruptcy steward. On your turn you choose: take the
  // guaranteed 50% settlement, or refuse and let the court decide (dice roll → the full claim or nothing,
  // plus a 1W fee). The steward doesn't mess around — court resolves immediately on your roll.
  import { ui, settleEstateUI, refuseEstateUI } from "../lib/store.js";
  import { money } from "../lib/money.js";
  const claims = $derived($ui.estate ?? []);
  const c = $derived(claims[0]);
</script>

{#if c}
  <div class="overlay">
    <div class="modal threat">
      <h2>🏛️ {c.fromName}'s estate — the bank settles up</h2>
      {#if c.owes}
        <p>{c.fromName} folded, and the bankruptcy steward is collecting on the
          <strong>{c.jobName}</strong> claim — you owe up to {$money(c.value)}. Settle now for
          <strong>{$money(c.settle)} (50%)</strong>, or refuse and let the court decide: a roll for the
          <strong>full {$money(c.value)} or nothing</strong>, plus a {$money(1)} fee.</p>
        <div class="row">
          <button onclick={() => settleEstateUI(c.id)}>Settle — pay {$money(c.settle)}</button>
          <button class="risk" onclick={() => refuseEstateUI(c.id)}>Take to court 🎲</button>
        </div>
      {:else}
        <p>{c.fromName} folded owing you on the <strong>{c.jobName}</strong> claim ({$money(c.value)}).
          The bank offers <strong>{$money(c.settle)} (50%)</strong> to close it now — or refuse and risk
          the court: a roll for the <strong>full {$money(c.value)} or nothing</strong>, less a {$money(1)} fee.</p>
        <div class="row">
          <button onclick={() => settleEstateUI(c.id)}>Take {$money(c.settle)}</button>
          <button class="risk" onclick={() => refuseEstateUI(c.id)}>Take to court 🎲</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Risky/secondary choice: an OUTLINE button so the label reads (the global yellow fill would hide
     the yellow text — that's how this button went blank, showing only the 🎲). */
  .risk { background: transparent; border: 1px solid #e0b341; color: #e0b341; }
  .risk:hover { background: rgba(224, 179, 65, 0.12); filter: none; }
</style>
