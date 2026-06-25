<script>
  import { ui, dismissPopup, skipAITurns } from "../lib/store.js";
  import { settings } from "../lib/settings.js";
  import Art from "./Art.svelte";

  const queue = $derived($ui.popups ?? []);
  const p = $derived(queue[0] ?? null);
  const more = $derived(queue.length > 1);

  // The non-zero recurring-expense lines, in statement order.
  const expenseLines = (r) =>
    [
      ["Rent", r.rent], ["Wages", r.wages], ["Equipment", r.equipment], ["Service premiums", r.premiums],
      ["Code fines", r.fines], ["LOC interest", r.interest], ["Town levy", r.levy],
    ].filter(([, v]) => v > 0);
</script>

{#if p}
  <div class="pop-overlay" onclick={dismissPopup}>
    <div class="pop" onclick={(e) => e.stopPropagation()}>
      {#if p.kind === "round"}
        {#if p.townlife}
          <div class="pop-art"><Art kind="townlife" id={p.townlife} label={p.season?.name} autoplay /></div>
        {:else}
          <div class="pop-art"><Art kind="season" id={p.season?.name?.toLowerCase() ?? "spring"} label={p.season?.name} autoplay /></div>
        {/if}
        <h2>Round {p.turn} · {p.season?.name ?? ""}</h2>
        <p class="pop-flavor">{p.season?.flavor ?? `A new round dawns over ${p.town ?? "Maple Hollow"}.`}</p>

      {:else if p.kind === "summary"}
        <h2>{p.rival ? "🤖" : "📋"} {p.name} — turn start</h2>
        <div class="summary-grid">
          <div class="summ-stat"><span class="lbl">Crew / capacity</span><span class="val">{p.recurring.crew} / {p.recurring.capacity}</span></div>
          <div class="summ-stat"><span class="lbl">Cash on hand</span><span class="val">{p.cash} W</span></div>
          <div class="summ-stat"><span class="lbl">This round's upkeep</span><span class="val" class:neg={p.upkeepNet < 0} class:pos={p.upkeepNet > 0}>{p.upkeepNet >= 0 ? "+" : ""}{p.upkeepNet} W</span></div>
          <div class="summ-stat"><span class="lbl">Cards drawn</span><span class="val">{p.drew}</span></div>
        </div>
        <h3>Recurring expenses <span class="muted">/ turn</span></h3>
        <div class="exp-list">
          {#each expenseLines(p.recurring) as [name, val]}
            <div class="exp-row"><span>{name}</span><span>{val} W</span></div>
          {/each}
          <div class="exp-row total"><span>Total per turn</span><span>{p.recurring.total} W</span></div>
        </div>
      {:else if p.kind === "character"}
        {#if p.rival}<div class="pop-rival">🤖 {p.rival}'s turn:</div>{/if}
        <div class="pop-art"><Art kind="townsfolk" id={p.npc} label={p.name} autoplay /></div>
        <h2>{p.name}</h2>
        <p class="pop-flavor">{p.role}</p>
        <p class="pop-effect">{p.line}</p>

      {:else if p.kind === "alert"}
        <h2>{p.title}</h2>
        <p class="pop-effect">{p.body}</p>

      {:else if p.kind === "card"}
        {#if p.rival}<div class="pop-rival">🤖 {p.rival} drew:</div>{/if}
        <div class="pop-art"><Art kind="card" id={p.art ?? p.cardId} label={p.name} autoplay={!p.rival && $settings.animateCards} /></div>
        <h2>{p.name}</h2>
        {#if p.flavor}<p class="pop-flavor">“{p.flavor}”</p>{/if}
        <p class="pop-effect">{p.text}</p>
        {#if p.rule}<div class="pop-rule">📜 {p.rule}</div>{/if}
      {/if}

      <div class="pop-foot">
        {#if p.rival}<button class="skip-rivals" onclick={skipAITurns}>Skip rivals ▶▶</button>{/if}
        <button class="pop-close" onclick={dismissPopup}>{more ? "Next ▶" : "Continue ▶"}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .pop-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 16px; }
  .pop { background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 18px 20px; max-width: 420px; width: 100%; box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
  .pop h2 { margin: 0 0 6px; }
  .pop h3 { margin: 14px 0 6px; font-size: 0.95em; }
  .pop-art { margin-bottom: 10px; border-radius: 10px; overflow: hidden; }
  .pop-flavor { color: var(--muted, #9aa0aa); font-style: italic; margin: 0 0 6px; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0; }
  .summ-stat { background: var(--panel-2, #1b1f27); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
  .summ-stat .lbl { font-size: 0.78em; color: var(--muted, #9aa0aa); }
  .summ-stat .val { font-size: 1.15em; font-weight: 700; font-variant-numeric: tabular-nums; }
  .val.neg { color: #e0564b; } .val.pos { color: #5fb87a; }
  .exp-list { display: flex; flex-direction: column; gap: 2px; }
  .exp-row { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }
  .exp-row span:first-child { color: var(--muted, #9aa0aa); }
  .exp-row.total { border-top: 1px solid var(--line, #2a2f3a); margin-top: 4px; padding-top: 4px; font-weight: 700; }
  .exp-row.total span:first-child { color: inherit; }
  .pop-effect { margin: 4px 0; }
  .pop-rival { font-size: 0.82em; color: var(--muted, #9aa0aa); font-weight: 600; margin-bottom: 4px; }
  .pop-rule { margin-top: 10px; padding: 8px 10px; background: var(--panel-2, #1b1f27); border-left: 3px solid var(--accent, #e0b341); border-radius: 6px; font-size: 0.86em; color: var(--ink, #e7e7ea); }
  .pop-foot { display: flex; gap: 8px; margin-top: 16px; }
  .pop-close { flex: 1; padding: 10px; font-weight: 700; }
  .skip-rivals { flex: 0 0 auto; padding: 10px 12px; background: var(--panel-2, #1b1f27); color: var(--muted, #9aa0aa); border: 1px solid var(--line, #2a2f3a); font-size: 0.85em; }
</style>
