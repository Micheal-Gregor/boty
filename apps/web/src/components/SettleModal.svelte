<script>
  import { ui, resolveSettleUI } from "../lib/store.js";
  const offers = $derived($ui.settle ?? []);
  const c = $derived(offers[0]);
</script>

{#if c}
  <div class="overlay">
    <div class="modal threat">
      <h2>🤝 {c.vendor} offers a settlement</h2>
      <p>You rolled a 6 dodging them. Clear the {c.amount} W bill now for
        <strong>{c.settle} W (50%)</strong> — or decline and keep dodging (and risk court next
        time the roll goes against you).</p>
      <div class="row">
        <button onclick={() => resolveSettleUI(c.payableId, true)}>Settle for {c.settle} W</button>
        <button onclick={() => resolveSettleUI(c.payableId, false)}>Keep dodging</button>
      </div>
    </div>
  </div>
{/if}
