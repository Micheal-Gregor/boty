<script>
  import { ui, sueDamagesUI, skipDamages } from "../lib/store.js";
  import { money } from "../lib/money.js";

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
      <h2>⚖️ {contractor?.name ?? "Your contractor"} walked off {c.jobName}</h2>
      <p>They left you out the work and the commission. Sue to <strong>recover up to {$money(c.value)}</strong>
        in damages, paid <strong>to you</strong> (capped by what they can actually cover). They roll to
        wriggle out (≈50%); a Slick Lawyer tilts it your way. {$money(1)} legal fee each.</p>
      <div class="row">
        <button onclick={() => sueDamagesUI(c.jobId, false)}>⚖️ Sue for {$money(c.value)}</button>
        {#if lawyers > 0}<button onclick={() => sueDamagesUI(c.jobId, true)}>🧑‍⚖️ Sue + Slick Lawyer</button>{/if}
        <button onclick={() => skipDamages(c.jobId)}>Let it go</button>
      </div>
    </div>
  </div>
{/if}
