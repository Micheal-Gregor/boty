<script>
  import { ui, playSabotage, playSue, playFavor, favorDropSuitUI, favorSabotageUI, cancelPick } from "../lib/store.js";
  import { money } from "../lib/money.js";

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
  // Everything a Favor can do, sorted into tabs so all options are visible at once.
  const favFines = $derived(
    type === "favor" && me ? (me.defects ?? []).map((d) => ({ ownerId: me.id, id: d.id, label: d.name, note: `waive the ${$money(d.fine)}/turn fine + repair` })) : [],
  );
  const favSuits = $derived(
    type === "favor" && s ? (s.lawsuits?.against ?? []).map((c) => ({ jobId: c.jobId, label: c.jobName, note: `drop ${c.other}'s suit (${$money(c.value)} at stake)` })) : [],
  );
  const favStanding = $derived(
    type === "favor" && s
      ? [
          ...(s.globalEffects ?? []).filter((g) => g.kind === "union").map((g) => ({ ownerId: meId, id: "union", label: g.name, note: "bust the union — firing gets cheap again" })),
          ...s.players.filter((p) => p.id !== meId).flatMap((p) =>
            (p.modifiers ?? []).map((m) => ({ ownerId: p.id, id: m.id, label: `${p.name}: ${m.name}`, note: m.positive ? "cancel their perk" : "drag out their woe" })),
          ),
        ]
      : [],
  );
  const favJobs = $derived(
    type === "favor" && s
      ? s.players.filter((p) => p.id !== meId).flatMap((p) =>
          p.jobs.filter((j) => ["Queued", "OnHold", "Active"].includes(j.state)).map((j) => ({
            jobId: j.id,
            label: `${p.name}: ${j.name}`,
            note: (p.modifiers ?? []).some((m) => m.kind === "private_security") ? "⚠ has Security — riskier; cancel it (Standing tab) first" : "set their job back",
          })),
        )
      : [],
  );
  const favorTabs = $derived([
    { key: "fines", label: "🚧 Your fines", items: favFines, kind: "favor" },
    { key: "suits", label: "⚖️ Suits vs you", items: favSuits, kind: "drop" },
    { key: "standing", label: "🛡️ Standing cards", items: favStanding, kind: "favor" },
    { key: "jobs", label: "⚔️ Sabotage", items: favJobs, kind: "sabotage" },
  ]);
  let favorTab = $state(null);
  const activeFavorTab = $derived(favorTab ?? favorTabs.find((g) => g.items.length)?.key ?? "fines");
  const activeGroup = $derived(favorTabs.find((g) => g.key === activeFavorTab) ?? favorTabs[0]);
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
        <h2>🪙 Favor — call in a quiet word</h2>
        <div class="tabbar">
          {#each favorTabs as g}
            <button class="tab" class:on={g.key === activeFavorTab} onclick={() => (favorTab = g.key)}>
              {g.label} <span class="tab-n">{g.items.length}</span>
            </button>
          {/each}
        </div>
        {#each activeGroup.items as t}
          <button class="target" onclick={() => (activeGroup.kind === "drop" ? favorDropSuitUI(t.jobId) : activeGroup.kind === "sabotage" ? favorSabotageUI(t.jobId) : playFavor(t.ownerId, t.id))}>
            {t.label} <span class="muted">({t.note})</span>
          </button>
        {:else}
          <p class="muted">
            {#if activeFavorTab === "fines"}No code violations on your shop to waive.
            {:else if activeFavorTab === "suits"}No lawsuits against you to drop.
            {:else if activeFavorTab === "jobs"}No rival jobs to sabotage right now.
            {:else}No union to bust and no rival standing cards to touch.{/if}
          </p>
        {/each}
      {:else}
        <h2>⚖️ Sue — collect a debt owed to you</h2>
        {#each sueTargets as t}
          <button class="target" onclick={() => playSue(t.debtor.id, t.ap.id)}>
            {t.debtor.name} owes you {$money(t.ap.amount)} <span class="muted">({t.ap.id})</span>
          </button>
        {:else}
          <p class="muted">Nobody owes you a suable debt right now.</p>
        {/each}
      {/if}
      <button class="mini" onclick={cancelPick}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .tabbar { display: flex; gap: 4px; margin: 4px 0 10px; flex-wrap: wrap; }
  .tab { flex: 1; min-width: 0; padding: 6px 8px; font-size: 0.82em; border: 1px solid var(--line, #2a3140); border-radius: 8px 8px 0 0; background: rgba(255,255,255,0.03); color: var(--muted, #9aa4b2); cursor: pointer; white-space: nowrap; }
  .tab.on { color: var(--text, #e8edf4); background: rgba(224,179,65,0.14); border-color: var(--accent, #e0b341); border-bottom-color: transparent; font-weight: 600; }
  .tab-n { display: inline-block; min-width: 16px; padding: 0 4px; margin-left: 2px; border-radius: 8px; background: rgba(255,255,255,0.08); font-size: 0.9em; }
</style>
