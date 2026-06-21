<script>
  import { ui, closeCard } from "../lib/store.js";
  import Art from "./Art.svelte";

  const c = $derived($ui.cardView);
  const cid = $derived(c ? c.id ?? c.cardId : "");

  // A one-line description: the resolved effect if we have it (a card drawn this turn), else a
  // static read from the card's own fields (a card opened from the log).
  function describe(card) {
    if (card.text) return card.text;
    if (card.type === "job") return `Job · ${card.value} W${card.required_trade ? ` · needs a ${card.required_trade}` : ""}`;
    if (card.cash != null) return `${card.cash >= 0 ? "+" : ""}${card.cash} W`;
    if (card.per_equipment != null) return `${card.per_equipment >= 0 ? "+" : ""}${card.per_equipment} W per equipment`;
    if (card.per_tradesman != null) return `${card.per_tradesman >= 0 ? "+" : ""}${card.per_tradesman} W per tradesperson`;
    if (card.amount != null) return `Vendor bill · ${card.amount} W`;
    if (card.fine != null) return `Code violation · ${card.fine} W/turn until fixed (fix ${card.fix_cost} W)`;
    return card.type ?? "";
  }
  const typeLabel = (t) => ({ job: "Job", windfall: "Windfall", shock: "Shock", payable: "Vendor bill", defect: "Code issue", gift: "Civil card", summons: "Summons", retirement: "Churn" })[t] ?? t;
</script>

{#if c}
  <div class="overlay" onclick={closeCard} role="presentation">
    <div class="modal card-detail" onclick={(e) => e.stopPropagation()} role="presentation">
      <div class="card-art-lg"><Art kind="card" id={cid} label={c.name} /></div>
      <div class="card-type {c.type}">{typeLabel(c.type)}</div>
      <h2>{c.name}</h2>
      {#if c.flavor}<p class="flavor">“{c.flavor}”</p>{/if}
      <p class="effect">{describe(c)}</p>
      <div class="row"><button onclick={closeCard}>Close</button></div>
    </div>
  </div>
{/if}
