<script>
  import { enterApp } from "../lib/store.js";
  import Shell from "./Shell.svelte";
</script>

<Shell bg="title" label="Business of the Year" framed>
  <div class="splash">
    <p class="bbb">🎀 The Maple Hollow Better Business Bureau presents</p>
    <h1>Business of the Year</h1>
    <p class="tag">Run a trade. Outwork your rivals. Be named the pride of Maple Hollow.</p>
    <button class="enter" onclick={enterApp}>▶ Enter Maple Hollow</button>
    <p class="hint">Click to begin — and to turn the sound on.</p>
  </div>
</Shell>

<style>
  .splash { text-align: center; }
  .bbb { color: var(--accent, #e0b341); font-weight: 600; letter-spacing: 0.04em; margin: 0 0 6px; }
  h1 { font-size: clamp(2.2rem, 7vw, 4rem); margin: 0 0 10px; text-shadow: 0 3px 18px rgba(0,0,0,0.6); }
  .tag { color: #cdd2da; font-size: 1.05rem; margin: 0 auto 28px; max-width: 30ch; }
  .enter { font-size: 1.15rem; font-weight: 800; padding: 14px 28px; border-radius: 12px; background: var(--accent, #e0b341); color: #1a1a1a; border: none; cursor: pointer; box-shadow: 0 8px 28px rgba(224,179,65,0.35); }
  .enter:hover { filter: brightness(1.08); }
  .hint { color: var(--muted, #9aa0aa); font-size: 0.85rem; margin-top: 14px; }
</style>
