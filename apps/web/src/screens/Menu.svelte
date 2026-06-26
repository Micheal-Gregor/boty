<script>
  import { goScreen } from "../lib/store.js";
  import Shell from "./Shell.svelte";
</script>

<Shell bg="menu" label="Maple Hollow">
  <div class="menu">
    <p class="bbb">🎀 Better Business Bureau · Est. 1867</p>
    <h1>Business of the Year</h1>
    <nav>
      <button class="primary" onclick={() => goScreen("setup")}>▶ Play</button>
      <button onclick={() => goScreen("history")}>📜 The Story of Maple Hollow</button>
      <button onclick={() => goScreen("faq")}>❔ How to Play &amp; FAQ</button>
      <button onclick={() => goScreen("credits")}>🎬 Credits</button>
    </nav>
    <p class="acct">Playing as <strong>Guest</strong> · accounts &amp; multiplayer coming soon</p>
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
  .acct { color: var(--muted, #9aa0aa); font-size: 0.85rem; margin-top: 26px; }
</style>
