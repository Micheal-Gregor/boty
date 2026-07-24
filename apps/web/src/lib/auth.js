// Auth store — a thin reactive wrapper over Supabase auth. `session` holds the current session
// (or null), `authReady` flips true once we've checked for an existing session on load, and `user`
// derives the signed-in user. Passwordless sign-in by EMAILED CODE: the player enters an email, gets
// a 6-digit code, and types it back into the app — no link to click, no browser redirect. That's what
// makes sign-in behave identically on the web and inside the wrapped store apps (Android TWA / Windows
// MSIX), where a magic-link redirect would land in a browser tab instead of the installed app.

import { writable, derived } from "svelte/store";
import { supabase, supabaseReady } from "./supabase.js";

export const session = writable(null);
export const authReady = writable(false);
export const user = derived(session, ($s) => $s?.user ?? null);

if (supabaseReady) {
  supabase.auth.getSession().then(({ data }) => {
    session.set(data.session ?? null);
    authReady.set(true);
  });
  supabase.auth.onAuthStateChange((_event, s) => session.set(s));
} else {
  authReady.set(true); // no backend configured → resolve immediately, app runs in guest mode
}

const cleanEmail = (email) => (email ?? "").trim().toLowerCase();
const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/** Email a one-time SIGN-IN CODE. With no `emailRedirectTo`, Supabase's email includes the `{{ .Token }}`
 *  code — make sure that token is in your "Magic Link" email template. `shouldCreateUser` stays false
 *  during the invite-only test; flip it to true at public launch to open self-registration.
 *  Returns { error } — null on success. */
export async function sendLoginCode(email) {
  if (!supabaseReady) return { error: "Sign-in isn't configured yet." };
  const clean = cleanEmail(email);
  if (!validEmail(clean)) return { error: "Enter a valid email address." };
  const { error } = await supabase.auth.signInWithOtp({
    email: clean,
    options: { shouldCreateUser: false },
  });
  if (error) {
    // Most failures here mean the email isn't on the invite list (signups are off for testing).
    const msg = /signup|not allowed|disabled|user/i.test(error.message)
      ? "That email isn't invited yet — ask for an invite, then try again."
      : error.message;
    return { error: msg };
  }
  return { error: null };
}

/** Verify the 6-digit code the player typed from their email. On success Supabase fires
 *  onAuthStateChange and the app moves past the login screen. Returns { error } — null on success. */
export async function verifyLoginCode(email, code) {
  if (!supabaseReady) return { error: "Sign-in isn't configured yet." };
  const clean = cleanEmail(email);
  const token = (code ?? "").replace(/\D/g, ""); // digits only — tolerate spaces the user pastes in
  if (token.length < 6) return { error: "Enter the code from your email." };
  const { error } = await supabase.auth.verifyOtp({ email: clean, token, type: "email" });
  if (error) {
    const msg = /expired/i.test(error.message) ? "That code expired — tap Resend for a fresh one."
      : /invalid|token|match/i.test(error.message) ? "That code didn't match — check it and try again."
      : error.message;
    return { error: msg };
  }
  return { error: null };
}

export async function signOut() {
  if (supabaseReady) { try { await supabase.auth.signOut(); } catch { /* ignore */ } }
  session.set(null);
}
