<script>
  import { ui, backToMenu, startOnlineGame } from "../lib/store.js";
  import { user } from "../lib/auth.js";
  import {
    onlineGame, onlineSeats, lobbyBusy, lobbyError, lobbyNote,
    hostGame, joinByCode, pickTrade, setSeatTrade, addAiSeat, removeSeat, leaveGame, myGames, resumeGame, removeGame,
  } from "../lib/games.js";
  import { friends, inviteFriend, licensed } from "../lib/social.js";
  import { startCheckout } from "../lib/billing.js";
  import Shell from "./Shell.svelte";

  let buying = $state(false);
  async function buyLicense() { buying = true; const r = await startCheckout("license"); if (r?.error) { lobbyError.set(r.error); buying = false; } }
  async function donate() { const r = await startCheckout("donate", 500); if (r?.error) lobbyError.set(r.error); }

  // Games you can jump back into (you hold a seat, it's still in progress). Loaded when the online home
  // is shown; a stand-in has been covering your seat while you were away.
  let resumable = $state([]);
  let loadingResume = $state(true);
  async function loadResumable() { loadingResume = true; resumable = await myGames(); loadingResume = false; }
  $effect(() => { if (!$onlineGame) loadResumable(); });
  async function dropResumable(g) { await removeGame(g); resumable = resumable.filter((x) => x.id !== g.id); }
  const cap2 = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : "");

  let invited = $state(new Set());
  async function invite(f) {
    const { error } = await inviteFriend($onlineGame.id, f.id);
    if (!error) invited = new Set(invited).add(f.id);
  }

  const services = $derived($ui.economy?.services ?? []);
  const isHost = $derived($onlineGame && $user && $onlineGame.host_id === $user.id);
  const mySeat = $derived(($onlineSeats ?? []).find((s) => s.user_id === $user?.id) ?? null);
  const takenTrades = $derived(new Set(($onlineSeats ?? []).map((s) => s.trade).filter(Boolean)));
  const cap = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : "");

  let code = $state("");
  let copied = $state(false);
  let difficulty = $state("standard");

  function copyCode() {
    try { navigator.clipboard?.writeText($onlineGame.code); copied = true; setTimeout(() => (copied = false), 1500); } catch { /* ignore */ }
  }
  function leaveAndBack() { leaveGame(); }
</script>

<Shell bg="menu" label="Play online">
  <div class="lobby">
    <button class="back" onclick={() => { if ($onlineGame) leaveGame(); backToMenu(); }}>← Menu</button>

    {#if !$onlineGame}
      <!-- Online home: host or join -->
      <h1>🌐 Play Online</h1>

      <div class="cards">
        <div class="card">
          <h2>Host a game</h2>
          <p class="muted">Create a table and share the code with your invited players.</p>
          <label class="diff">Difficulty
            <select bind:value={difficulty} disabled={!$licensed}>
              <option value="steady">Steady</option>
              <option value="standard">Standard</option>
              <option value="cutthroat">Cutthroat</option>
            </select>
          </label>
          {#if $licensed}
            <button class="primary" disabled={$lobbyBusy} onclick={() => hostGame(difficulty)}>{$lobbyBusy ? "Creating…" : "Host a game ▶"}</button>
          {:else}
            <button class="primary unlock" disabled={buying} onclick={buyLicense}>{buying ? "Opening checkout…" : "🔓 Unlock hosting — $5"}</button>
            <p class="muted locknote">A one-time <strong>$5</strong> license unlocks hosting multiplayer, for life. Solo play and joining games stay free.</p>
          {/if}
        </div>
        <div class="card">
          <h2>Join a game</h2>
          <p class="muted">Got a code from the host? Enter it here.</p>
          <input placeholder="MAPLE-XXXX" bind:value={code} onkeydown={(e) => e.key === "Enter" && joinByCode(code)} />
          <button class="primary" disabled={$lobbyBusy || !code.trim()} onclick={() => joinByCode(code)}>{$lobbyBusy ? "Joining…" : "Join ▶"}</button>
        </div>
      </div>

      {#if !loadingResume && resumable.length}
        <div class="resume">
          <h2>▶ Resume a game</h2>
          <p class="muted">You've got game{resumable.length > 1 ? "s" : ""} in progress — jump back in. A stand-in has been covering your seat.</p>
          {#each resumable as g (g.id)}
            <div class="resume-row">
              <button class="resume-go" disabled={$lobbyBusy} onclick={() => resumeGame(g)}>
                <span class="rcode">{g.code}</span>
                <span class="muted">· {cap2(g.difficulty)}{#if g.status === "paused"} · paused{/if}</span>
                <span class="rgo">Resume ▶</span>
              </button>
              <button class="resume-x" title="Remove from this list" aria-label="Remove game" onclick={() => dropResumable(g)}>✕</button>
            </div>
          {/each}
        </div>
      {/if}

      <p class="donate-line">Enjoying Maple Hollow? <button class="donate-link" onclick={donate}>☕ Chip in $5</button></p>
    {:else}
      <!-- In a lobby -->
      <h1>Lobby</h1>
      <div class="codebar">
        <span class="muted">Share this code:</span>
        <button class="code" onclick={copyCode} title="Copy to clipboard">{$onlineGame.code} {copied ? "✓" : "⧉"}</button>
        <span class="muted">· {cap($onlineGame.difficulty)}</span>
      </div>

      <div class="seats">
        {#each $onlineSeats as s (s.seat)}
          <div class="seat" class:me={s.user_id === $user?.id}>
            <span class="who">
              {s.is_ai ? "🤖" : "🧑"} <strong>{s.display_name ?? "—"}</strong>
              {#if s.user_id === $user?.id}<span class="tag">you</span>{/if}
              {#if $onlineGame.host_id === s.user_id}<span class="tag host">host</span>{/if}
            </span>
            <span class="trade">
              {#if isHost && s.is_ai}
                <select value={s.trade ?? ""} onchange={(e) => setSeatTrade(s.seat, e.currentTarget.value)}>
                  <option value="">auto</option>
                  {#each services as t}<option value={t} disabled={takenTrades.has(t) && s.trade !== t}>{cap(t)}</option>{/each}
                </select>
              {:else if s.trade}{cap(s.trade)}
              {:else if s.is_ai}<span class="muted">auto</span>
              {:else}<span class="muted">choosing…</span>{/if}
            </span>
            {#if isHost && s.user_id !== $user?.id}<button class="kick" title="Remove" onclick={() => removeSeat(s.seat)}>✕</button>{/if}
          </div>
        {/each}
      </div>

      {#if mySeat}
        <div class="picker">
          <p class="muted">Your trade:</p>
          <div class="trades">
            {#each services as t}
              <button class="trade-btn" class:on={mySeat.trade === t} disabled={takenTrades.has(t) && mySeat.trade !== t} onclick={() => pickTrade(t)}>{cap(t)}</button>
            {/each}
          </div>
        </div>
      {/if}

      <div class="controls">
        {#if isHost}
          <button onclick={addAiSeat}>+ Add CPU</button>
          <button class="primary" onclick={startOnlineGame}>Start game ▶</button>
        {:else}
          <span class="muted waiting">Waiting for the host to start…</span>
        {/if}
        <button class="leave" onclick={leaveAndBack}>Leave</button>
      </div>
      {#if isHost && $friends.length}
        <div class="invite">
          <span class="muted">Invite a friend:</span>
          {#each $friends as f (f.id)}
            <button class="inv" disabled={invited.has(f.id)} onclick={() => invite(f)}>{invited.has(f.id) ? `✓ ${f.username}` : f.username}</button>
          {/each}
        </div>
      {/if}
    {/if}

    {#if $lobbyError}<p class="err">{$lobbyError}</p>{/if}
    {#if $lobbyNote}<p class="note">{$lobbyNote}</p>{/if}
  </div>
</Shell>

<style>
  .lobby { max-width: 560px; margin: 0 auto; }
  .back { background: none; border: 1px solid var(--line, #2a2f3a); color: var(--muted, #9aa0aa); border-radius: 8px; padding: 6px 12px; cursor: pointer; margin-bottom: 12px; }
  .back:hover { color: var(--accent, #e0b341); border-color: var(--accent, #e0b341); }
  h1 { margin: 0 0 16px; }
  h2 { margin: 0 0 6px; font-size: 1.1rem; }
  .resume { background: rgba(87,201,138,0.08); border: 1px solid #3f6f56; border-radius: 14px; padding: 16px; margin-top: 16px; }
  .resume h2 { color: #7fdca0; }
  .resume-row { display: flex; align-items: stretch; gap: 6px; margin-top: 8px; }
  .resume-go { display: flex; align-items: center; gap: 8px; flex: 1; text-align: left; border-color: #3f6f56; }
  .resume-go:hover:not(:disabled) { border-color: #7fdca0; }
  .rcode { font-weight: 800; letter-spacing: 0.05em; color: var(--accent, #e0b341); }
  .rgo { margin-left: auto; color: #7fdca0; font-weight: 800; }
  .resume-x { padding: 0 12px; color: #e0564b; border-color: #3f6f56; font-weight: 700; }
  .resume-x:hover { border-color: #e0564b; }
  .cards { display: flex; gap: 14px; flex-wrap: wrap; }
  .card { flex: 1 1 220px; background: rgba(16,18,24,0.78); border: 1px solid var(--line, #2a2f3a); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; gap: 10px; }
  .muted { color: var(--muted, #9aa0aa); font-size: 0.9rem; }
  input, select { padding: 10px 12px; font-size: 1rem; border-radius: 8px; border: 1px solid var(--line, #2a2f3a); background: var(--panel-2, #1b1f27); color: var(--ink, #e7e7ea); text-transform: uppercase; }
  select { text-transform: none; }
  .diff { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted, #9aa0aa); font-size: 0.9rem; }
  button { padding: 10px 14px; font-weight: 700; border-radius: 8px; background: var(--panel, #161a22); color: var(--ink, #e7e7ea); border: 1px solid var(--line, #2a2f3a); cursor: pointer; }
  button:hover:not(:disabled) { border-color: var(--accent, #e0b341); }
  button:disabled { opacity: 0.55; cursor: default; }
  button.primary { background: var(--accent, #e0b341); color: #1a1a1a; border: none; }
  button.primary.unlock { background: linear-gradient(180deg, #57c98a, #3f9d6a); color: #0c1a12; border: none; }
  button.primary.unlock:hover:not(:disabled) { filter: brightness(1.06); }
  .locknote { margin-top: 6px; font-size: 0.8rem; }
  .donate-line { text-align: center; color: var(--muted, #9aa0aa); font-size: 0.85rem; margin-top: 18px; }
  .donate-link { background: none; border: none; color: var(--accent, #e0b341); cursor: pointer; font: inherit; text-decoration: underline; padding: 0; }
  .codebar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
  .code { font-size: 1.2rem; font-weight: 800; letter-spacing: 0.06em; color: var(--accent, #e0b341); background: var(--panel-2, #1b1f27); border: 1px dashed var(--accent, #e0b341); }
  .seats { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
  .seat { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--panel, #161a22); border: 1px solid var(--line, #2a2f3a); border-radius: 10px; }
  .seat.me { border-color: var(--accent, #e0b341); }
  .who { flex: 1; display: flex; align-items: center; gap: 6px; }
  .trade { color: var(--muted, #9aa0aa); }
  .tag { font-size: 0.68rem; font-weight: 700; padding: 1px 6px; border-radius: 6px; background: var(--panel-2, #1b1f27); color: var(--muted, #9aa0aa); }
  .tag.host { color: var(--accent, #e0b341); }
  .kick { padding: 2px 8px; background: none; border: 1px solid var(--line, #2a2f3a); color: #e0564b; }
  .picker { margin-bottom: 14px; }
  .trades { display: flex; flex-wrap: wrap; gap: 6px; }
  .trade-btn { padding: 8px 12px; font-weight: 600; }
  .trade-btn.on { background: var(--accent, #e0b341); color: #1a1a1a; border: none; }
  .controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .controls .leave { margin-left: auto; color: #e0564b; }
  .invite { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 10px; }
  .invite .inv { padding: 5px 10px; font-size: 0.85em; font-weight: 600; }
  .invite .inv:disabled { opacity: 0.6; color: #7fdca0; cursor: default; }
  .waiting { font-style: italic; }
  .err { color: #e0564b; margin-top: 12px; }
  .note { color: var(--accent, #e0b341); margin-top: 12px; }
</style>
