<script>
  import { ui, playSabotage, playSue, playFavor, cancelPick } from "../lib/store.js";

  const s = $derived($ui.view);
  const me = $derived(s ? s.players[s.activePlayerIndex] : null);
  const meId = $derived(me?.id ?? null);
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
  const favorTargets = $derived(
    type === "favor" && s
      ? [
          // The town union — a favor busts it, and firing gets cheap again.
          ...(s.globalEffects ?? []).filter((g) => g.kind === "union").map((g) => ({ ownerId: meId, id: "union", label: `🪙 ${g.name}`, note: "bust the union" })),
          // Your own code violations — call in a favor and the inspector waives it.
          ...(me?.defects ?? []).map((d) => ({ ownerId: me.id, id: d.id, label: `Your shop: ${d.name}`, note: `waive the ${d.fine} W/turn fine` })),
          // A rival's standing card — cut a good one short, or drag a bad one out.
          ...s.players.filter((p) => p.id !== meId).flatMap((p) =>
            (p.modifiers ?? []).map((m) => ({ ownerId: p.id, id: m.id, label: `${p.name}: ${m.name}`, note: m.positive ? "cancel it" : "drag it out" })),
          ),
        ]
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
      {:else if type === "favor"}
        <h2>🪙 Favor — waive your own violation, or hit a rival's standing card</h2>
        {#each favorTargets as t}
          <button class="target" onclick={() => playFavor(t.ownerId, t.id)}>
            {t.label} <span class="muted">({t.note})</span>
          </button>
        {:else}
          <p class="muted">Nothing to favor — no code violation on your shop, and no rival standing card.</p>
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
