<script>
  import { sendLoginCode, verifyLoginCode } from "../lib/auth.js";
  import Shell from "./Shell.svelte";

  let email = $state("");
  let code = $state("");
  let step = $state("email"); // email | code
  let status = $state("idle"); // idle | sending | verifying | error
  let errorMsg = $state("");

  async function sendCode(e) {
    e?.preventDefault?.();
    if (status === "sending") return;
    status = "sending";
    errorMsg = "";
    const { error } = await sendLoginCode(email);
    if (error) { status = "error"; errorMsg = error; }
    else { status = "idle"; step = "code"; code = ""; }
  }

  async function verify(e) {
    e?.preventDefault?.();
    if (status === "verifying") return;
    status = "verifying";
    errorMsg = "";
    const { error } = await verifyLoginCode(email, code);
    // On success onAuthStateChange swaps this screen out — nothing more to do here.
    if (error) { status = "error"; errorMsg = error; }
  }

  async function resend() {
    errorMsg = "";
    code = "";
    status = "sending";
    const { error } = await sendLoginCode(email);
    status = error ? "error" : "idle";
    if (error) errorMsg = error;
  }

  function restart() { step = "email"; status = "idle"; errorMsg = ""; code = ""; }
</script>

<Shell bg="menu" label="Sign in">
  <div class="login">
    <p class="bbb">🎀 Better Business Bureau · Est. 1867</p>
    <h1>Business of the Year</h1>

    {#if step === "code"}
      <form class="card" onsubmit={verify}>
        <h2>📬 Enter your code</h2>
        <p>We emailed a sign-in code to <strong>{email}</strong>. Type it in below.
          (Give it a minute, and peek in spam if it's slow.)</p>
        <input
          class="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]*"
          maxlength="10"
          placeholder="Enter code"
          bind:value={code}
          required
        />
        <button class="primary" type="submit" disabled={status === "verifying"}>
          {status === "verifying" ? "Checking…" : "Sign in ▶"}
        </button>
        {#if status === "error"}<p class="err">{errorMsg}</p>{/if}
        <div class="row">
          <button type="button" class="link" onclick={resend} disabled={status === "sending"}>
            {status === "sending" ? "Sending…" : "Resend code"}
          </button>
          <button type="button" class="link" onclick={restart}>Use a different email</button>
        </div>
      </form>
    {:else}
      <form class="card" onsubmit={sendCode}>
        <p class="lede">Testers sign in with a one-time email code — no password to remember.</p>
        <input type="email" placeholder="you@example.com" bind:value={email} autocomplete="email" required />
        <button class="primary" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Email me a code ▶"}
        </button>
        {#if status === "error"}<p class="err">{errorMsg}</p>{/if}
        <p class="hint">Invite-only while we're testing. Not on the list yet? Ask for an invite.</p>
      </form>
    {/if}
  </div>
</Shell>

<style>
  .login { text-align: center; }
  .bbb { color: var(--accent, #e0b341); font-weight: 600; letter-spacing: 0.04em; margin: 0 0 4px; }
  h1 { font-size: clamp(1.8rem, 5.5vw, 3rem); margin: 0 0 22px; text-shadow: 0 3px 18px rgba(0,0,0,0.6); }
  .card { max-width: 360px; margin: 0 auto; background: rgba(16,18,24,0.78); border: 1px solid var(--line, #2a2f3a); border-radius: 14px; padding: 22px 22px 18px; display: flex; flex-direction: column; gap: 12px; }
  .card h2 { margin: 0; }
  .card p { margin: 0; color: #cdd2da; line-height: 1.5; font-size: 0.95rem; }
  .lede { color: var(--muted, #9aa0aa); }
  input { padding: 12px 14px; font-size: 1rem; border-radius: 10px; border: 1px solid var(--line, #2a2f3a); background: var(--panel-2, #1b1f27); color: var(--ink, #e7e7ea); }
  input:focus { outline: none; border-color: var(--accent, #e0b341); }
  input.code { text-align: center; font-size: 1.5rem; letter-spacing: 0.3em; font-variant-numeric: tabular-nums; padding-left: 0.3em; }
  input.code::placeholder { font-size: 1rem; letter-spacing: normal; }
  .row { display: flex; justify-content: space-between; gap: 8px; margin-top: 2px; }
  button.link { background: none; border: none; box-shadow: none; padding: 4px 2px; font-size: 0.82rem; font-weight: 600; color: var(--muted, #9aa0aa); cursor: pointer; }
  button.link:hover { color: var(--accent, #e0b341); }
  button.link:disabled { opacity: 0.6; cursor: default; }
  button { padding: 12px 16px; font-size: 1rem; font-weight: 700; border-radius: 10px; background: var(--panel, #161a22); color: var(--ink, #e7e7ea); border: 1px solid var(--line, #2a2f3a); cursor: pointer; }
  button:hover { border-color: var(--accent, #e0b341); }
  button.primary { background: var(--accent, #e0b341); color: #1a1a1a; border: none; box-shadow: 0 6px 20px rgba(224,179,65,0.3); }
  button:disabled { opacity: 0.6; cursor: default; }
  .err { color: #e0564b !important; font-size: 0.88rem; }
  .hint { color: var(--muted, #9aa0aa) !important; font-size: 0.8rem; }
</style>
