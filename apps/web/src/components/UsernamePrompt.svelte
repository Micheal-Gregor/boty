<script>
  import { needsUsername, setUsername } from "../lib/social.js";
  let name = $state("");
  let err = $state(null);
  let busy = $state(false);
  async function save() {
    if (busy) return;
    busy = true; err = null;
    const { error } = await setUsername(name);
    busy = false;
    if (error) err = error;
  }
</script>

{#if $needsUsername}
  <div class="pop-overlay">
    <div class="pop un">
      <h2>👋 Pick your player name</h2>
      <p class="sub">This is the name other players see on the board and in games — your email stays private.</p>
      <input bind:value={name} placeholder="e.g. MapleMechanic" maxlength="20" autocomplete="off"
             onkeydown={(e) => e.key === "Enter" && save()} />
      {#if err}<p class="err">{err}</p>{/if}
      <button class="go" disabled={busy} onclick={save}>{busy ? "…" : "That's me ▶"}</button>
      <p class="hint">3–20 letters, numbers, or underscores.</p>
    </div>
  </div>
{/if}

<style>
  .pop-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 70; padding: 16px; }
  .pop.un { background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 20px 22px; max-width: 380px; width: 100%; text-align: center; }
  h2 { margin: 0 0 6px; }
  .sub { color: var(--muted, #9aa0aa); font-size: 0.9em; margin: 0 0 14px; }
  input { width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 1.05em; border-radius: 8px; border: 1px solid var(--line, #2a3140); background: var(--panel-2, #1b1f27); color: var(--text, #e8edf4); text-align: center; }
  .err { color: #e8746a; font-size: 0.85em; margin: 8px 0 0; }
  .go { margin-top: 12px; width: 100%; padding: 11px; font-size: 1.05em; font-weight: 700; border: none; border-radius: 8px; background: var(--accent, #e0b341); color: #1a1a1a; cursor: pointer; }
  .go:disabled { opacity: 0.6; cursor: default; }
  .hint { color: var(--muted, #9aa0aa); font-size: 0.78em; margin: 10px 0 0; }
</style>
