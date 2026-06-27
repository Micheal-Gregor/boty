<script>
  import { ui, act, endTurn, isAI, viewCard, cardInLine, skipAITurns, openSettings, openHand, openRivals, openRules, openEntity, borrowCredit } from "../lib/store.js";
  import { money, cashText } from "../lib/money.js";
  import { muted, toggleMute, playSfx, playMusic } from "../lib/sound.js";
  import { seasonFor, findBuilding } from "@boty/engine";
  import Shop from "../components/Shop.svelte";
  import Art from "../components/Art.svelte";
  import Popup from "../components/Popup.svelte";
  import Settings from "../components/Settings.svelte";
  import EntityCard from "../components/EntityCard.svelte";
  import HandView from "../components/HandView.svelte";
  import RivalShop from "../components/RivalShop.svelte";
  import Rules from "../components/Rules.svelte";
  import Confirm from "../components/Confirm.svelte";
  import Dice from "../components/Dice.svelte";
  import Flash from "../components/Flash.svelte";

  // Which play-area is showing on a phone. On wide screens all three are columns and this is moot.
  let tab = $state("shop");

  const s = $derived($ui.view);
  const econ = $derived($ui.economy);
  const me = $derived(s ? s.players[s.activePlayerIndex] : null);
  const season = $derived(s ? seasonFor({ turn: s.turn, economy: econ, flavor: $ui.flavor }) : null);
  const seasonSlug = $derived(season ? season.name.toLowerCase() : "spring");
  const drawn = $derived($ui.ctx?.drawn ?? []);
  const pnl = $derived(s?.pnl); // the active player's profit & loss, summed from the G/L
  const bs = $derived(s?.bs); // the balance sheet
  const locOwed = $derived((bs?.liabilityLines ?? []).find((l) => l.acct === 2100)?.amount ?? 0);
  let booksView = $state("pl"); // "pl" | "bs"
  const rivals = $derived(s ? s.players.filter((_, i) => i !== s.activePlayerIndex) : []);
  const logTail = $derived(s ? s.log.slice(-8) : []);

  const nextBuilding = $derived.by(() => {
    if (!me) return null;
    const here = findBuilding(econ, me.building);
    return econ.buildings.find((b) => (b.tier ?? 1) === (here.tier ?? 1) + 1) ?? null;
  });
  const handHas = (type) => me?.hand.some((c) => c.type === type);
  const aiTurn = $derived($ui.aiActing); // an object {name, drew, lines} while a rival plays
  // Trade → art slug (most services are one word; HVAC technician is the exception).
  const tradeSlug = (svc) => (svc === "HVAC technician" ? "hvac" : svc.toLowerCase());

  // On YOUR fresh turn that dealt cards, flip to the Fortune tab so you watch the draw, then you
  // tap over to your shop to act. (On wide screens all three are columns, so this is a no-op.)
  let lastSig = $state("");
  $effect(() => {
    const sig = s ? `${s.turn}:${s.activePlayerIndex}` : "";
    if (sig && sig !== lastSig) {
      lastSig = sig;
      if (!aiTurn && drawn.length) { tab = "fortune"; playSfx("deal", 0.5); }
    }
  });
  // While a rival plays, sit on the Table tab so you watch the open books move.
  $effect(() => { if (aiTurn) tab = "table"; });
  // Seasonal ambient loop — switches when the season turns (no-op until music files exist).
  $effect(() => { if (seasonSlug) playMusic(seasonSlug); });
</script>

<div class="board season-{seasonSlug}">
  <header class="banner">
    <span class="town">{$ui.flavor?.town ?? "Order to Cash"}</span>
    <span class="season">{season?.name}</span>
    <span class="round">round {s.turn} / {econ.max_turns}</span>
    <span class="turn">▶ {me.name}'s turn</span>
    <button class="mute" aria-label="toggle sound" title={$muted ? "sound off" : "sound on"} onclick={toggleMute}>{$muted ? "🔇" : "🔊"}</button>
    <button class="mute" aria-label="view rivals" title="rivals' shops" onclick={openRivals}>👥</button>
    <button class="mute" aria-label="open hand" title="open hand" onclick={openHand}>🃏</button>
    <button class="mute" aria-label="rules" title="how to play" onclick={openRules}>❔</button>
    <button class="mute" aria-label="settings" title="settings" onclick={openSettings}>⚙️</button>
  </header>

  <Popup />
  <Settings />
  <EntityCard />
  <HandView />
  <RivalShop />
  <Rules />
  <Confirm />
  <Dice />

  {#if s.globalEffects?.length}
    <div class="town-banner">
      {#each s.globalEffects as g}
        <button class="town-effect" onclick={() => openEntity("global", g.id)} title="View this town effect">🌐 {g.name}{#if g.kind === "levy"} — {$money(g.magnitude)}/turn levy{/if} · {g.kind === "union" ? "until busted" : `${g.turnsLeft} round${g.turnsLeft === 1 ? "" : "s"} left`}</button>
      {/each}
    </div>
  {/if}

  {#if me.defects?.length}
    <div class="town-banner warn">
      {#each me.defects as d}
        <button class="town-effect bad" onclick={() => openEntity("defect", d.id)} title="Tap to fix — restores your crew's output">🚧 {d.name} — output −{d.productivity_hit}/turn + {$money(d.fine)}/turn fine · tap to fix</button>
      {/each}
    </div>
  {/if}

  {#if aiTurn}
    <div class="ai-banner">
      <div class="ai-head">
        <span>🤖 <strong>{aiTurn.name}</strong> is working the phones…</span>
        <button class="skip" onclick={skipAITurns}>Skip ▶▶</button>
      </div>
      {#if aiTurn.drew?.length}<div class="ai-drew">drew: {aiTurn.drew.join(", ")}</div>{/if}
      {#if aiTurn.lines?.length}<ul class="ai-log">{#each aiTurn.lines as l}<li>{$cashText(l)}</li>{/each}</ul>{/if}
    </div>
  {/if}

  <div class="tabs" class:books-mode={tab === "books"}>
    <!-- TABLE: the town stage + the open books + the running log -->
    <section class="tabview" class:active={tab === "table"}>
      <div class="town-stage">
        <Art kind={`town/${seasonSlug}`} id="mainst" label={`${season?.name ?? ""} — Maple Hollow`} />
      </div>
      <h2>The table</h2>
      <div class="rivals">
        {#each rivals as r}
          <div class="rival" class:bankrupt={r.bankrupt}>
            <strong>{r.name}</strong> {isAI(r.id) ? "🤖" : "🧑"}
            <span class="cash">{$money(r.cash)}</span>
            <span class="muted">{findBuilding(econ, r.building).name} · {r.tradesmen.length} crew · {r.jobs.length} jobs</span>
            {#if r.bankrupt}<span class="tag">bankrupt</span>{/if}
          </div>
        {/each}
      </div>
      <h3>Table log</h3>
      <ul class="log">
        {#each logTail as line}
          {@const card = cardInLine(line)}
          {#if card}
            <li><button class="logline" onclick={() => viewCard(card)}>{$cashText(line)} <span class="peek">🃏</span></button></li>
          {:else}
            <li>{$cashText(line)}</li>
          {/if}
        {/each}
      </ul>
    </section>

    <!-- FORTUNE: the deck and what it dealt this turn -->
    <section class="tabview" class:active={tab === "fortune"}>
      <div class="fortune-head">
        <h2>Fortune</h2>
        <div class="deck-wrap" title="the Fortune deck">
          <span class="deck-count">{s.deckLeft} left</span>
          <div class="deck">
            <span class="deck-card"></span><span class="deck-card"></span><span class="deck-card"></span>
          </div>
        </div>
      </div>
      {#if drawn.length}
        {#each drawn as d, i (d.cardId + i)}
          <button class="card fortune dealt" style="animation-delay:{i * 140}ms" onclick={() => viewCard(d)}>
            <Art kind="card" id={d.art ?? d.cardId} label={d.name} />
            <div class="card-name">{d.name} <span class="peek">🔍</span></div>
            {#if d.flavor}<div class="flavor">“{$cashText(d.flavor)}”</div>{/if}
            <div class="effect">{$cashText(d.text)}</div>
          </button>
        {/each}
      {:else}
        <p class="muted">No cards drawn this turn — the deck is quiet for now.</p>
      {/if}
    </section>

    <!-- YOUR SHOP: your sheet + the action bar -->
    <section class="tabview shop-view" class:active={tab === "shop"}>
      <div class="shop-stage">
        <Art kind={`shop/${tradeSlug(me.service)}`} id={me.building} label={`${me.service} ${findBuilding(econ, me.building).name}`} />
      </div>
      <!-- During a rival's turn `me` is THAT rival (you're watching), so lock the sheet — it's not yours to act on. -->
      <div class="sheet-lock" class:locked={!!aiTurn}>
        <Shop player={me} {econ} {handHas} {nextBuilding} />
      </div>
      <fieldset class="actions" disabled={!!aiTurn}>
        <Flash section="general" />
        <button title="Borrow cash now — a liability with interest, force-settled at year-end" onclick={borrowCredit}>🏦 Bank Credit</button>
        {#if locOwed > 0}<button title="Repay the line of credit" onclick={() => act((g) => g.repayCredit())}>Repay ({$money(locOwed)})</button>{/if}
        {#if $ui.view?.mustStaffBoon}<span class="boon-hint" title="Chief Boon's job is mandatory">⛑ Staff Chief Boon's job to end your turn</span>{/if}
        <button class="end" class:blocked={$ui.view?.mustStaffBoon} onclick={endTurn}>End turn ▶</button>
      </fieldset>
    </section>

    <!-- BOOKS: the financial statements, straight off the general ledger -->
    <section class="tabview books-tab" class:active={tab === "books"}>
      <h2>The books · {me.name}</h2>
      <div class="books-toggle">
        <button class:on={booksView === "pl"} onclick={() => (booksView = "pl")}>Profit &amp; Loss</button>
        <button class:on={booksView === "bs"} onclick={() => (booksView = "bs")}>Balance Sheet</button>
      </div>
      {#if booksView === "bs" && bs}
        <div class="pl">
          <div class="pl-row total"><span>Assets</span><span>{$money(bs.assets)}</span></div>
          {#each bs.assetLines as l}<div class="pl-row sub"><span>{l.name}</span><span>{l.amount}</span></div>{/each}
          <div class="pl-row total"><span>Liabilities</span><span>{$money(bs.liabilities)}</span></div>
          {#each bs.liabilityLines as l}<div class="pl-row sub"><span>{l.name}</span><span>{l.amount}</span></div>{/each}
          {#if !bs.liabilityLines.length}<div class="pl-row sub"><span>none</span><span>0</span></div>{/if}
          <div class="pl-row total"><span>Equity</span><span>{$money(bs.equity)}</span></div>
          <div class="pl-row sub"><span>Owner's capital</span><span>{bs.capital}</span></div>
          <div class="pl-row sub"><span>Retained earnings (net income)</span><span>{bs.retained}</span></div>
          <div class="pl-row net"><span>Liabilities + equity</span><span>{$money(bs.liabilities + bs.equity)}</span></div>
          <p class="muted" style="margin-top:8px">Assets {bs.assets} = Liabilities {bs.liabilities} + Equity {bs.equity}. The books always balance.</p>
        </div>
      {:else if pnl}
        <div class="pl">
          <div class="pl-row total"><span>Revenue</span><span>{$money(pnl.revenue)}</span></div>
          {#each pnl.revenueLines as l}<div class="pl-row sub"><span>{l.name}</span><span>{l.amount}</span></div>{/each}
          <div class="pl-row total"><span>− Cost of jobs (COGS)</span><span>{$money(pnl.cogs)}</span></div>
          {#each pnl.cogsLines as l}<div class="pl-row sub"><span>{l.name}</span><span>({l.amount})</span></div>{/each}
          <div class="pl-row margin"><span>Gross margin</span><span>{$money(pnl.grossMargin)}</span></div>
          <div class="pl-row total"><span>− Overhead</span><span>{$money(pnl.overhead)}</span></div>
          {#each pnl.overheadLines as l}<div class="pl-row sub"><span>{l.name}</span><span>({l.amount})</span></div>{/each}
          <div class="pl-row net" class:bad={pnl.netIncome < 0}><span>Net income</span><span>{$money(pnl.netIncome)}</span></div>
        </div>
        <div class="cash-vs-profit">
          <div class="cvp"><span class="muted">Net income (on paper)</span><strong class:bad={pnl.netIncome < 0}>{$money(pnl.netIncome)}</strong></div>
          <div class="cvp"><span class="muted">Cash in the bank</span><strong>{$money(me.cash)}</strong></div>
          <p class="muted">Profit isn't cash: you book revenue the moment a job's done, but the money lands later — that gap is the whole game.</p>
        </div>
      {/if}
    </section>
  </div>

  <!-- Bottom tab bar — also the way to reach the Books on a wide screen -->
  <nav class="tabbar">
    <button class:on={tab === "table"} onclick={() => (tab = "table")}>🗺️<span>Table</span></button>
    <button class:on={tab === "fortune"} onclick={() => (tab = "fortune")}>🃏<span>Fortune</span></button>
    <button class:on={tab === "shop"} onclick={() => (tab = "shop")}>🏪<span>Your shop</span></button>
    <button class:on={tab === "books"} onclick={() => (tab = "books")}>📒<span>Books</span></button>
  </nav>
</div>
