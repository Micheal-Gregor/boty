<script>
  import { ui, resolveSettleUI } from "../lib/store.js";
  import { money } from "../lib/money.js";
  const offers = $derived($ui.settle ?? []);
  const c = $derived(offers[0]);
</script>

{#if c}
  <div class="overlay">
    <div class="modal threat">
      <h2>🤝 {c.vendor} offers a settlement</h2>
      <p>You rolled a 6 dodging them. Clear the {$money(c.amount)} bill now for
        <strong>{$money(c.settle)} (50%)</strong> — or decline and keep dodging (and risk court next
        time the roll goes against you).</p>
      <div class="row">
        <button onclick={() => resolveSettleUI(c.payableId, true)}>Settle for {$money(c.settle)}</button>
        <button onclick={() => resolveSettleUI(c.payableId, false)}>Keep dodging</button>
      </div>
    </div>
  </div>
{/if}
