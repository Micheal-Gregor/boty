<script>
  // The hand as a CARD CAROUSEL — scroll left↔right through everything you hold, the focus card
  // centred and larger, neighbours faded. Filter the groups with the checkboxes. Click a card to
  // open its action card. (E5 — "it's a game with cards".)
  import { ui, openEntity, closeHand } from "../lib/store.js";
  import { money } from "../lib/money.js";
  import { findEquipment } from "@boty/engine";
  import { crewIdentity } from "../lib/crew.js";
  import { settings } from "../lib/settings.js";
  import Art from "./Art.svelte";

  const econ = $derived($ui.economy);
  const view = $derived($ui.view);
  const me = $derived(view ? view.players[view.activePlayerIndex] : null);
  const open = $derived($ui.handView);
  const gearName = (e) => findEquipment(econ, e.defId).name;
  const tradeSlug = (svc) => (svc === "HVAC technician" ? "hvac" : (svc ?? "").toLowerCase());
  const equipArtId = (e) => (e.defId === "pro" ? `pro/${tradeSlug(me?.service)}` : e.defId); // per-trade pro gear

  let show = $state({ crew: true, equip: true, jobs: true, persistent: true, playable: true, global: true });
  const typeDefs = [
    { key: "crew", label: "Tradespeople" }, { key: "equip", label: "Equipment" }, { key: "jobs", label: "Jobs" },
    { key: "persistent", label: "Persistent" }, { key: "playable", label: "Playable" }, { key: "global", label: "Global" },
  ];

  // Flatten the enabled groups into one carousel list.
  const items = $derived.by(() => {
    if (!me) return [];
    const out = [];
    if (show.crew) for (const t of me.tradesmen) out.push({ kind: "worker", id: t.id, type: "Tradesperson", title: crewIdentity(t.id).name, sub: `⚡${t.productivity} · ${t.tool ?? "bare-handed"}`, art: ["crew", t.id] });
    if (show.equip) for (const e of me.equipment) out.push({ kind: "equipment", id: e.id, type: "Equipment", title: gearName(e), sub: e.assigned_to ? `→ ${crewIdentity(e.assigned_to).name}` : "💤 idle", art: ["equipment", equipArtId(e), e.id] });
    if (show.jobs) for (const j of me.jobs) out.push({ kind: "job", id: j.id, type: "Job", title: j.name, sub: `${j.work_done}/${j.work_amount} · ${$money(j.value)}`, art: ["card", j.art ?? j.card] });
    if (show.persistent) for (const m of me.modifiers ?? []) out.push({ kind: "mod", type: "Persistent", title: m.name, sub: m.positive ? "🛡️ standing" : "⚠️ standing", icon: m.positive ? "🛡️" : "⚠️", art: ["card", m.art ?? (m.kind === "union" ? "union_drive" : m.kind)] });
    if (show.playable) for (const c of me.hand ?? []) out.push({ kind: "play", type: "Playable", title: c.name, sub: "🃏 hand card", icon: "🃏", art: ["card", c.art ?? c.id ?? c.type] });
    if (show.global) for (const g of view.globalEffects ?? []) out.push({ kind: "global", id: g.id, type: "Global", title: g.name, sub: g.kind === "union" ? "until busted" : `${g.turnsLeft} round(s) left`, icon: "🌐", art: ["card", g.art ?? (g.kind === "union" ? "union_drive" : g.kind === "boom" ? "county_fair" : "downtown_storm")] });
    return out;
  });

  let scroller = $state(null);
  let activeIdx = $state(0);
  function onScroll() {
    if (!scroller) return;
    const mid = scroller.scrollLeft + scroller.clientWidth / 2;
    let best = 0, bestD = Infinity;
    [...scroller.querySelectorAll(".cc")].forEach((el, i) => { const c = el.offsetLeft + el.offsetWidth / 2; const d = Math.abs(c - mid); if (d < bestD) { bestD = d; best = i; } });
    activeIdx = best;
  }
  const openable = (k) => ["worker", "equipment", "job", "global"].includes(k);
  function clickCard(it) { if (openable(it.kind)) { closeHand(); openEntity(it.kind, it.id); } }
</script>

{#if open && me}
  <div class="ent-overlay" onclick={closeHand}>
    <div class="hand-modal" onclick={(e) => e.stopPropagation()}>
      <button class="ent-x" onclick={closeHand}>✕</button>
      <h2>🃏 Your cards</h2>

      <div class="cc-scroll" bind:this={scroller} onscroll={onScroll}>
        {#each items as it, i (it.kind + (it.id ?? it.title))}
          <button class="cc" class:active={i === activeIdx} class:near={Math.abs(i - activeIdx) === 1} class:flat={!openable(it.kind)} onclick={() => clickCard(it)}>
            <div class="cc-art">{#if it.art}<Art kind={it.art[0]} id={it.art[1]} seed={it.art[2] ?? ""} label={it.title} autoplay={i === activeIdx && $settings.animateCards} />{:else}<div class="cc-icon">{it.icon}</div>{/if}</div>
            <div class="cc-type">{it.type}</div>
            <div class="cc-title">{it.title}</div>
            <div class="cc-sub muted">{it.sub}</div>
          </button>
        {:else}
          <p class="muted empty">No cards in the selected groups.</p>
        {/each}
      </div>

      <div class="cc-filters">
        {#each typeDefs as td}
          <label><input type="checkbox" bind:checked={show[td.key]} /> {td.label}</label>
        {/each}
      </div>
      <button class="pop-close" onclick={closeHand}>Close</button>
    </div>
  </div>
{/if}

<style>
  .ent-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 66; padding: 12px; }
  .hand-modal { position: relative; background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 16px 0 14px; max-width: 520px; width: 100%; }
  .ent-x { position: absolute; top: 8px; right: 12px; background: none; border: none; font-size: 1.1em; cursor: pointer; color: var(--muted, #9aa0aa); z-index: 2; }
  .hand-modal h2 { margin: 0 0 10px; padding: 0 18px; }
  .cc-scroll { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 8px calc(50% - 84px); scrollbar-width: thin; }
  .cc { scroll-snap-align: center; flex: 0 0 168px; height: 232px; background: var(--panel-2, #1b1f27); border: 1px solid var(--line, #2a2f3a); border-radius: 12px; padding: 10px; cursor: pointer; color: var(--ink, #e7e7ea); display: flex; flex-direction: column; gap: 4px; opacity: 0.5; transform: scale(0.86); transition: transform 0.16s, opacity 0.16s, border-color 0.16s; }
  .cc.near { opacity: 0.8; transform: scale(0.94); }
  .cc.active { opacity: 1; transform: scale(1); border-color: var(--accent, #e0b341); }
  .cc.flat { cursor: default; }
  .cc-art { flex: 1; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: var(--slot, #11151c); }
  .cc-icon { font-size: 3em; }
  .cc-type { font-size: 0.72em; color: var(--accent, #e0b341); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
  .cc-title { font-weight: 700; line-height: 1.1; }
  .cc-sub { font-size: 0.82em; }
  .empty { padding: 30px; width: 100%; text-align: center; }
  .cc-filters { display: flex; flex-wrap: wrap; gap: 6px 14px; justify-content: center; padding: 12px 18px 0; }
  .cc-filters label { display: flex; align-items: center; gap: 4px; font-size: 0.85em; cursor: pointer; }
  .cc-filters input { accent-color: var(--accent, #e0b341); }
  .pop-close { margin: 14px 18px 0; width: calc(100% - 36px); padding: 10px; font-weight: 700; }
</style>
