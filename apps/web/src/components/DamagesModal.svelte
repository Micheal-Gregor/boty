<script>
  import { ui, sueDamagesUI, skipDamages } from "../lib/store.js";

  // Don't show while a response window or a court case is open.
  const claims = $derived(!$ui.threat && !$ui.court ? ($ui.damages ?? []) : []);
  const c = $derived(claims[0]);
  const s = $derived($ui.view);
  const me = $derived(s ? s.players[s.activePlayerIndex] : null);
  const contractor = $derived(c && s ? s.players.find((p) => p.id === c.contractorId) : null);
  const lawyers = $derived(me ? me.hand.filter((h) => h.type === "slick_lawyer").length : 0);
</script>

{#if c}
  <div class="overlay">
    <div class="modal threat">
      <h2>⚖️ {contractor?.name ?? "Your contractor"} botched {c.jobName}</h2>
      <p>Your liability is already cleared. You can sue them for <strong>{c.value} W in damages</strong> —
        which they pay the <strong>bank</strong>, not you. You just sink a rival. You win on a
        <strong>4–6 (50%)</strong> defence roll going against them; a Slick Lawyer shifts it your way.
        1 W legal fee each.</p>
      <div class="row">
        <button onclick={() => sueDamagesUI(c.jobId, false)}>⚖️ Sue for {c.value} W</button>
        {#if lawyers > 0}<button onclick={() => sueDamagesUI(c.jobId, true)}>🧑‍⚖️ Sue + Slick Lawyer</button>{/if}
        <button onclick={() => skipDamages(c.jobId)}>Let it go</button>
      </div>
    </div>
  </div>
{/if}
