<script>
  import { goScreen, openSettings } from "../lib/store.js";
  import { openFeedback } from "../lib/feedback.js";
  import { user, signOut } from "../lib/auth.js";
  import { supabaseReady } from "../lib/supabase.js";
  import { friendRequests, gameInvites } from "../lib/social.js";
  import Shell from "./Shell.svelte";
  const pings = $derived($friendRequests.length + $gameInvites.length);
</script>

<Shell bg="menu" label="Maple Hollow">
  <div class="menu">
    <p class="bbb">🎀 Better Business Bureau · Est. 1867</p>
    <h1>Business of the Year</h1>
    <nav>
      <button class="primary" onclick={() => goScreen("setup")}>▶ Play (this device)</button>
      {#if supabaseReady && $user}
        <button class="primary online" onclick={() => goScreen("lobby")}>🌐 Play Online</button>
        <button onclick={() => goScreen("players")}>👥 Players{#if pings} <span class="badge">{pings}</span>{/if}</button>
      {/if}
      <button onclick={() => goScreen("history")}>📜 The Story of Maple Hollow</button>
      <button onclick={() => goScreen("faq")}>❔ How to Play &amp; FAQ</button>
      <button onclick={openSettings}>⚙️ Settings</button>
      {#if supabaseReady && $user}<button class="feedback" onclick={openFeedback}>💬 Send feedback</button>{/if}
      <button onclick={() => goScreen("credits")}>🎬 Credits</button>
    </nav>
    {#if supabaseReady && $user}
      <p class="acct">Signed in as <strong>{$user.email}</strong> · <button class="link" onclick={signOut}>Sign out</button></p>
    {:else}
      <p class="acct">Playing as <strong>Guest</strong> · sign-in coming soon</p>
    {/if}
  </div>
</Shell>

<style>
  .menu { text-align: center; }
  .bbb { color: var(--accent, #e0b341); font-weight: 600; letter-spacing: 0.04em; margin: 0 0 4px; }
  h1 { font-size: clamp(2rem, 6vw, 3.4rem); margin: 0 0 26px; text-shadow: 0 3px 18px rgba(0,0,0,0.6); }
  nav { display: flex; flex-direction: column; gap: 12px; max-width: 360px; margin: 0 auto; }
  nav button { padding: 14px 18px; font-size: 1.05rem; font-weight: 700; border-radius: 10px; background: var(--panel, #161a22); color: var(--ink, #e7e7ea); border: 1px solid var(--line, #2a2f3a); cursor: pointer; }
  nav button:hover { border-color: var(--accent, #e0b341); }
  nav button.primary { background: var(--accent, #e0b341); color: #1a1a1a; border: none; box-shadow: 0 6px 20px rgba(224,179,65,0.3); }
  .badge { display: inline-block; min-width: 1.4em; padding: 0 5px; border-radius: 10px; background: #e8746a; color: #fff; font-size: 0.8em; font-weight: 800; }
  .acct { color: var(--muted, #9aa0aa); font-size: 0.85rem; margin-top: 26px; }
  .acct .link { background: none; border: none; color: var(--accent, #e0b341); cursor: pointer; font: inherit; padding: 0; text-decoration: underline; }
</style>
