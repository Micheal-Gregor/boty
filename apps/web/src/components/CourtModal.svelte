<script>
  import { ui, resolveCourtUI } from "../lib/store.js";
  import { money } from "../lib/money.js";

  const cases = $derived($ui.court ?? []);
  const c = $derived(cases[0]);
  const s = $derived($ui.view);
  const me = $derived(s ? s.players[s.activePlayerIndex] : null);
  const lawyers = $derived(me ? me.hand.filter((h) => h.type === "slick_lawyer").length : 0);
</script>

{#if c}
  <div class="overlay">
    <div class="modal threat">
      {#if c.lawsuit}
        <h2>⚖️ {c.vendor}</h2>
        <p>A disgruntled client is suing you for {$money(c.amount)}. You <strong>walk on a 1–3 (50%)</strong>;
          a <strong>Slick Lawyer</strong> pushes that to <strong>1–5 (83%)</strong>. Walk → dismissed; lose →
          you pay {$money(c.amount)}. Either way there's a {$money(1)} legal fee.</p>
      {:else}
        <h2>⚖️ {c.vendor} hauled you to court</h2>
        <p>You stretched them {$money(c.amount)} and failed the Demand Roll. You <strong>walk on a
          1–2 (33%)</strong>; a <strong>Slick Lawyer</strong> pushes that to <strong>1–4 (67%)</strong>.
          Walk → the debt is wiped; lose → you pay {$money(c.amount)}. Either way there's a {$money(1)} legal fee.</p>
      {/if}
      <div class="row">
        <button disabled={lawyers === 0} onclick={() => resolveCourtUI(c.payableId, true)}>
          🧑‍⚖️ Play Slick Lawyer ({lawyers} in hand)
        </button>
        <button onclick={() => resolveCourtUI(c.payableId, false)}>Take your chances</button>
      </div>
    </div>
  </div>
{/if}
