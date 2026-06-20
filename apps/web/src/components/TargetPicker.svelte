<script>
  import { ui, playSabotage, playSue, cancelPick } from "../lib/store.js";

  const s = $derived($ui.view);
  const meId = $derived(s ? s.players[s.activePlayerIndex].id : null);
  const type = $derived($ui.picking);

  const sabTargets = $derived(
    type === "sabotage" && s
      ? s.players.filter((p) => p.id !== meId).flatMap((p) =>
          p.jobs.filter((j) => ["Queued", "OnHold", "Active"].includes(j.state)).map((j) => ({ owner: p, job: j })),
        )
      : [],
  );
  const sueTargets = $derived(
    type === "sue" && s
      ? s.players.filter((p) => p.id !== meId).flatMap((p) =>
          p.payables.filter((a) => !a.is_npc && a.creditor_id === meId && a.sue_window_remaining > 0).map((a) => ({ debtor: p, ap: a })),
        )
      : [],
  );
</script>

{#if type}
  <div class="overlay" onclick={cancelPick}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      {#if type === "sabotage"}
        <h2>⚔️ Sabotage — pick a rival's job</h2>
        {#each sabTargets as t}
          <button class="target" onclick={() => playSabotage(t.job.id)}>
            {t.owner.name}: {t.job.name}
            <span class="muted">[{t.job.state}] {t.job.work_done}/{t.job.work_amount}</span>
          </button>
        {:else}
          <p class="muted">No rival jobs to sabotage right now.</p>
        {/each}
      {:else}
        <h2>⚖️ Sue — collect a debt owed to you</h2>
        {#each sueTargets as t}
          <button class="target" onclick={() => playSue(t.debtor.id, t.ap.id)}>
            {t.debtor.name} owes you {t.ap.amount} W <span class="muted">({t.ap.id})</span>
          </button>
        {:else}
          <p class="muted">Nobody owes you a suable debt right now.</p>
        {/each}
      {/if}
      <button class="mini" onclick={cancelPick}>Cancel</button>
    </div>
  </div>
{/if}
