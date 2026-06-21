<script>
  import { ui, resolveCourtUI } from "../lib/store.js";

  const cases = $derived($ui.court ?? []);
  const c = $derived(cases[0]);
  const s = $derived($ui.view);
  const me = $derived(s ? s.players[s.activePlayerIndex] : null);
  const lawyers = $derived(me ? me.hand.filter((h) => h.type === "slick_lawyer").length : 0);
</script>

{#if c}
  <div class="overlay">
    <div class="modal threat">
      <h2>⚖️ {c.vendor} hauled you to court</h2>
      <p>You stretched them {c.amount} W and failed the Demand Roll. You <strong>walk on a
        1–2 (33%)</strong>; a <strong>Slick Lawyer</strong> pushes that to <strong>1–4 (67%)</strong>.
        Walk → the debt is wiped; lose → you pay {c.amount} W. Either way there's a 1 W legal fee.</p>
      <div class="row">
        <button disabled={lawyers === 0} onclick={() => resolveCourtUI(c.payableId, true)}>
          🧑‍⚖️ Play Slick Lawyer ({lawyers} in hand)
        </button>
        <button onclick={() => resolveCourtUI(c.payableId, false)}>Take your chances</button>
      </div>
    </div>
  </div>
{/if}
