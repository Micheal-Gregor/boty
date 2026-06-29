<script>
  import { backToMenu, goScreen } from "../lib/store.js";
  import { joinByCode } from "../lib/games.js";
  import { myProfile, friends, friendRequests, gameInvites, leaderboard, sendFriendRequest, acceptRequest, removeFriend, dismissInvite } from "../lib/social.js";
  import Shell from "./Shell.svelte";

  let addName = $state("");
  let note = $state(null);
  let board = $state([]);
  let loadingBoard = $state(true);

  leaderboard().then((b) => { board = b; loadingBoard = false; });

  async function add() {
    note = null;
    const { error } = await sendFriendRequest(addName);
    note = error ? { err: true, msg: error } : { err: false, msg: `Request sent to ${addName}.` };
    if (!error) addName = "";
  }
  async function joinInvite(inv) { goScreen("lobby"); await joinByCode(inv.code); dismissInvite(inv.id); }
</script>

<Shell bg="menu" label="Players">
  <div class="page">
    <button class="back" onclick={backToMenu}>← Menu</button>
    <h1>👥 Players</h1>
    {#if $myProfile}<p class="me">You're <strong>{$myProfile.username}</strong> · {$myProfile.games_won}🏆 / {$myProfile.games_played} games</p>{/if}

    {#if $gameInvites.length}
      <section>
        <h3>📨 Game invites</h3>
        {#each $gameInvites as inv (inv.id)}
          <div class="row">
            <span><strong>{inv.fromName}</strong> invited you ({inv.code})</span>
            <span class="acts">
              <button class="go" onclick={() => joinInvite(inv)}>Join</button>
              <button class="mini" onclick={() => dismissInvite(inv.id)}>Dismiss</button>
            </span>
          </div>
        {/each}
      </section>
    {/if}

    {#if $friendRequests.length}
      <section>
        <h3>🤝 Friend requests</h3>
        {#each $friendRequests as r (r.rowId)}
          <div class="row"><span><strong>{r.username}</strong> wants to be friends</span>
            <button class="go" onclick={() => acceptRequest(r.rowId)}>Accept</button></div>
        {/each}
      </section>
    {/if}

    <section>
      <h3>Friends ({$friends.length})</h3>
      <div class="addrow">
        <input bind:value={addName} placeholder="add by username" maxlength="20" onkeydown={(e) => e.key === "Enter" && add()} />
        <button class="go" onclick={add}>Add</button>
      </div>
      {#if note}<p class:err={note.err} class="note">{note.msg}</p>{/if}
      {#each $friends as f (f.id)}
        <div class="row"><span>{f.username}</span><button class="mini" onclick={() => removeFriend(f.id)}>Remove</button></div>
      {:else}
        <p class="muted">No friends yet — add someone by their username.</p>
      {/each}
    </section>

    <section>
      <h3>🏆 Leaderboard</h3>
      {#if loadingBoard}<p class="muted">Loading…</p>
      {:else if !board.length}<p class="muted">No games finished yet.</p>
      {:else}
        {#each board as p, i (p.username)}
          <div class="row board" class:me={p.username === $myProfile?.username}>
            <span class="rank">{i + 1}.</span><span class="who">{p.username}</span>
            <span class="stat">{p.games_won}🏆 · {p.games_played} played</span>
          </div>
        {/each}
      {/if}
    </section>
  </div>
</Shell>

<style>
  .page { background: rgba(16,18,24,0.78); border: 1px solid var(--line, #2a2f3a); border-radius: 14px; padding: 20px 22px; max-width: 520px; margin: 0 auto; }
  .back { background: none; border: 1px solid var(--line, #2a2f3a); color: var(--muted, #9aa0aa); border-radius: 8px; padding: 6px 12px; cursor: pointer; float: left; }
  .back:hover { color: var(--accent, #e0b341); border-color: var(--accent, #e0b341); }
  h1 { margin: 0 0 4px; clear: both; padding-top: 6px; }
  .me { color: var(--muted, #9aa0aa); margin: 0 0 14px; }
  section { margin: 16px 0; }
  h3 { margin: 0 0 8px; font-size: 0.95em; color: var(--accent, #e0b341); }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; border: 1px solid var(--line, #2a3140); border-radius: 8px; margin: 4px 0; }
  .row.board { gap: 10px; }
  .row.me { border-color: var(--accent, #e0b341); }
  .rank { color: var(--muted, #9aa0aa); width: 2em; }
  .who { flex: 1; font-weight: 600; }
  .stat { color: var(--muted, #9aa0aa); font-size: 0.85em; }
  .acts { display: flex; gap: 6px; }
  .addrow { display: flex; gap: 6px; margin-bottom: 6px; }
  .addrow input { flex: 1; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line, #2a3140); background: var(--panel-2, #1b1f27); color: var(--text, #e8edf4); }
  .go { padding: 6px 12px; border: none; border-radius: 8px; background: var(--accent, #e0b341); color: #1a1a1a; font-weight: 700; cursor: pointer; }
  .mini { padding: 5px 10px; border: 1px solid var(--line, #2a3140); border-radius: 8px; background: transparent; color: var(--muted, #9aa0aa); cursor: pointer; }
  .note { font-size: 0.85em; color: #7fdca0; margin: 2px 0 6px; }
  .note.err { color: #e8746a; }
  .muted { color: var(--muted, #9aa0aa); }
</style>
