<script>
  // Shown when THIS account has the same game open in another tab/window. This tab is read-only (the
  // store blocks all writes + driving while it's not the active session) so two sessions of one profile
  // can't write the move log at once and desync the game. "Play here" moves control to this tab.
  import { ui, backToMenu, claimThisSession } from "../lib/store.js";

  const show = $derived($ui.view?.readOnlySession && ($ui.screen === "board" || $ui.screen === "reckoning" || $ui.screen === "gala"));
</script>

{#if show}
  <div class="session-bar" role="status" aria-live="polite">
    <span class="ico">🖥️</span>
    <span class="msg"><strong>This game is open in another window.</strong> To keep the game in sync, only one window can play at a time — this one's watching.</span>
    <button class="here" onclick={claimThisSession}>Play here</button>
    <button class="leave" onclick={backToMenu}>Menu</button>
  </div>
{/if}

<style>
  .session-bar {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 900;
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px;
    background: linear-gradient(0deg, rgba(20,30,52,0.97), rgba(16,22,40,0.94));
    border-top: 1px solid #6f86bf;
    color: #e3e9f6; font-size: 0.95rem;
    box-shadow: 0 -2px 14px rgba(0,0,0,0.45);
  }
  .ico { font-size: 1.3rem; line-height: 1; }
  .msg { flex: 1; }
  .msg strong { color: #b9c6e6; }
  .here {
    padding: 7px 14px; font-weight: 800; border-radius: 8px;
    background: var(--accent, #e0b341); color: #1a1a1a; border: none; cursor: pointer; white-space: nowrap;
  }
  .here:hover { filter: brightness(1.08); }
  .leave {
    padding: 7px 12px; font-weight: 700; border-radius: 8px;
    background: transparent; color: #b9c6e6; border: 1px solid #56628a; cursor: pointer; white-space: nowrap;
  }
  .leave:hover { border-color: #6f86bf; }
</style>
