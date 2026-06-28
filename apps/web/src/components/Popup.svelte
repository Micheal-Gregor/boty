<script>
  import { ui, dismissPopup, skipAITurns } from "../lib/store.js";
  import { money, cashText } from "../lib/money.js";
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
        <p class="pop-flavor">{p.townlifeFlavor ?? p.season?.flavor ?? `A new round dawns over ${p.town ?? "Maple Hollow"}.`}</p>
        {#if p.lead}<p class="pop-lead">{p.leadIsMe ? "✨ You lead off — clear this and make your move!" : `▶ ${p.lead} leads off this round.`}</p>{/if}

      {:else if p.kind === "summary"}
        <h2>{p.rival ? "🤖" : "📋"} {p.name} — turn start</h2>
        <div class="summary-grid">
          <div class="summ-stat"><span class="lbl">Crew / capacity</span><span class="val">{p.recurring.crew} / {p.recurring.capacity}</span></div>
          <div class="summ-stat"><span class="lbl">Cash on hand</span><span class="val">{$money(p.cash)}</span></div>
          <div class="summ-stat"><span class="lbl">This round's upkeep</span><span class="val" class:neg={p.upkeepNet < 0} class:pos={p.upkeepNet > 0}>{p.upkeepNet >= 0 ? "+" : ""}{$money(p.upkeepNet)}</span></div>
          <div class="summ-stat"><span class="lbl">Cards drawn</span><span class="val">{p.drew}</span></div>
        </div>
        <h3>Recurring expenses <span class="muted">/ turn</span></h3>
        <div class="exp-list">
          {#each expenseLines(p.recurring) as [name, val]}
            <div class="exp-row"><span>{name}</span><span>{$money(val)}</span></div>
          {/each}
          <div class="exp-row total"><span>Total per turn</span><span>{$money(p.recurring.total)}</span></div>
        </div>
      {:else if p.kind === "character"}
        {#if p.rival}<div class="pop-rival">🤖 {p.rival}'s turn:</div>{/if}
        <div class="pop-art"><Art kind="townsfolk" id={p.npc} label={p.name} autoplay /></div>
        <h2>{p.name}</h2>
        <p class="pop-flavor">{p.role}</p>
        <p class="pop-effect">{p.line}</p>

      {:else if p.kind === "deckbuilt"}
        <div class="shuffle-deck adding"><span class="sc sc1"></span><span class="sc sc2"></span><span class="sc sc3"></span></div>
        <h2>🃏 A unique deck is dealt</h2>
        <p class="pop-effect">A one-of-a-kind <strong>{p.size}-card</strong> deck has been built for this game from Maple Hollow's {p.pool} possible events — then shuffled fresh for every player. No two games, and no two seats, play alike. <span class="muted">({p.reserve} more wait in reserve.)</span></p>

      {:else if p.kind === "roll"}
        <h2>🎲 Who goes first?</h2>
        <div class="roll-dice">
          {#each p.rolls as r, i}
            <span class="rdie" class:dud={r > p.players} class:landed={i === p.rolls.length - 1} style="animation-delay:{i * 240}ms">{["⚀","⚁","⚂","⚃","⚄","⚅"][r - 1]}</span>
          {/each}
        </div>
        {#if p.rolls.length > 1}<p class="muted">Rolled past the table {p.rolls.length - 1}× — re-rolled until it landed on a seat.</p>{/if}
        <p class="pop-effect">{#if p.leadIsMe}🎯 <strong>You lead off Round 1!</strong>{:else}<strong>{p.leadName}</strong> leads off Round 1!{/if}</p>
        <p class="pop-flavor">The lead-off rotates one seat clockwise each round — the first-mover edge passes around the whole table.</p>

      {:else if p.kind === "shuffle"}
        <div class="shuffle-deck" class:adding={!p.removed} class:pulling={p.removed}>
          <span class="sc sc1"></span><span class="sc sc2"></span><span class="sc sc3"></span>
          <span class="badge">{p.removed ? "−" : "+"}{p.count}</span>
        </div>
        <h2>🔀 Your deck reshuffles</h2>
        <p class="pop-effect">{p.removed ? "➖" : "➕"} {p.count} {p.add === "networking_lunch" ? (p.count === 1 ? "networking lunch" : "networking lunches") : (p.count === 1 ? "job" : "jobs")} — {p.reason}</p>

      {:else if p.kind === "alert"}
        <h2>{p.title}</h2>
        <p class="pop-effect">{$cashText(p.body)}</p>

      {:else if p.kind === "card"}
        {#if p.who}<div class="pop-rival">{p.isAi ? "🤖" : "👤"} {p.who} drew — not your card:</div>{:else if p.rival}<div class="pop-rival">🤖 {p.rival} drew:</div>{/if}
        <div class="pop-art" class:others={p.who}><Art kind="card" id={p.art ?? p.cardId} label={p.name} autoplay={p.forceAnim || $settings.animateCards} /></div>
        <h2>{p.name}</h2>
        {#if p.flavor}<p class="pop-flavor">“{$cashText(p.flavor)}”</p>{/if}
        <p class="pop-effect" class:hit={p.text?.includes("⚡")} class:gain={p.text?.includes("💰")}>{$cashText(p.text)}</p>
        {#if p.routing}
          <div class="routing">
            <div class="routing-hd">🧰 {p.routing.kind === "incident" ? "Tenders" : "Trades"} routed · due turn {p.routing.deadlineTurn}</div>
            {#each p.routing.portions as part}
              <div class="routing-row" class:mine={part.isActor}>
                <span class="rt-trade">{part.trade}</span>
                <span class="rt-arrow">→</span>
                <span class="rt-who">{part.isActor && p.ownContract ? "You" : part.who}</span>
                <span class="rt-val">{$money(part.value)}</span>
              </div>
              <div class="rt-note">{part.note}</div>
            {/each}
            <p class="routing-foot">{$cashText(p.routing.headline)}</p>
          </div>
        {/if}
        {#if p.rule}<div class="pop-rule">📜 {$cashText(p.rule)}</div>{/if}
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
  .pop-art { margin-bottom: 10px; border-radius: 10px; overflow: hidden; text-align: center; }
  /* Keep any aspect ratio (incl. tall 9:16 round-start art) inside the screen — scale to fit, never overflow. */
  .pop-art :global(img), .pop-art :global(video) { max-width: 100%; max-height: 52vh; width: auto; height: auto; margin: 0 auto; display: block; }
  .pop-effect.hit { color: #e8746a; font-weight: 600; }
  .pop-effect.gain { color: #5fb87a; font-weight: 600; }
  .pop-flavor { color: var(--muted, #9aa0aa); font-style: italic; margin: 0 0 6px; }
  .pop-lead { color: var(--accent, #e0b341); font-weight: 700; margin: 4px 0 6px; }
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
  .pop-art.others { filter: grayscale(0.55) brightness(0.85); opacity: 0.9; } /* another player's card — clearly not yours */
  .roll-dice { display: flex; gap: 10px; justify-content: center; align-items: center; margin: 10px 0 6px; flex-wrap: wrap; }
  .rdie { font-size: 3rem; line-height: 1; opacity: 0; transform: scale(0.4) rotate(-25deg); animation: rdie-drop 0.42s cubic-bezier(.2,1.3,.5,1) forwards; }
  .rdie.dud { color: var(--muted, #9aa0aa); opacity: 0.4; font-size: 2.1rem; }
  .rdie.landed { color: var(--accent, #e0b341); text-shadow: 0 0 14px rgba(224,179,65,0.6); }
  @keyframes rdie-drop { to { opacity: 1; transform: scale(1) rotate(0); } }
  .shuffle-deck { position: relative; width: 110px; height: 84px; margin: 10px auto 14px; }
  .shuffle-deck .sc { position: absolute; left: 50%; top: 50%; width: 46px; height: 64px; margin: -32px 0 0 -23px; border-radius: 6px; background: #f4f1e8; border: 1px solid #d8d2c0; box-shadow: 0 2px 6px rgba(0,0,0,0.45); }
  .shuffle-deck.adding .sc { background: linear-gradient(#f6f2e6, #d6ead2); }
  .shuffle-deck.pulling .sc { background: linear-gradient(#f6f2e6, #f2d6d2); }
  .shuffle-deck .sc1 { animation: riffle 0.9s ease-in-out infinite; }
  .shuffle-deck .sc2 { animation: riffle 0.9s ease-in-out infinite 0.15s; }
  .shuffle-deck .sc3 { animation: riffle 0.9s ease-in-out infinite 0.3s; }
  @keyframes riffle { 0%,100% { transform: translate(0,0) rotate(0); } 30% { transform: translateX(-30px) rotate(-13deg); } 65% { transform: translateX(30px) rotate(13deg); } }
  .shuffle-deck .badge { position: absolute; top: -10px; right: 2px; min-width: 26px; padding: 2px 7px; border-radius: 11px; font-weight: 800; font-size: 0.9em; text-align: center; z-index: 2; }
  .shuffle-deck.adding .badge { background: #5fb87a; color: #0f1a12; }
  .shuffle-deck.pulling .badge { background: #e8746a; color: #1a1010; }
  .pop-rule { margin-top: 10px; padding: 8px 10px; background: var(--panel-2, #1b1f27); border-left: 3px solid var(--accent, #e0b341); border-radius: 6px; font-size: 0.86em; color: var(--ink, #e7e7ea); }
  .routing { margin-top: 10px; padding: 10px 12px; background: var(--panel-2, #1b1f27); border-radius: 8px; }
  .routing-hd { font-size: 0.8em; font-weight: 700; color: var(--accent, #e0b341); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
  .routing-row { display: grid; grid-template-columns: 1fr auto 1.3fr auto; align-items: center; gap: 8px; font-variant-numeric: tabular-nums; }
  .routing-row.mine { font-weight: 700; }
  .rt-trade { text-transform: capitalize; }
  .rt-arrow { color: var(--muted, #9aa0aa); }
  .rt-who { text-align: right; }
  .rt-val { text-align: right; color: var(--accent, #e0b341); font-weight: 700; }
  .rt-note { font-size: 0.76em; color: var(--muted, #9aa0aa); margin: 0 0 6px; }
  .routing-foot { font-size: 0.84em; margin: 6px 0 0; padding-top: 6px; border-top: 1px solid var(--line, #2a2f3a); }
  .pop-foot { display: flex; gap: 8px; margin-top: 16px; }
  .pop-close { flex: 1; padding: 10px; font-weight: 700; }
  .skip-rivals { flex: 0 0 auto; padding: 10px 12px; background: var(--panel-2, #1b1f27); color: var(--muted, #9aa0aa); border: 1px solid var(--line, #2a2f3a); font-size: 0.85em; }
</style>
