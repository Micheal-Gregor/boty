// Auth store — a thin reactive wrapper over Supabase auth. `session` holds the current session
// (or null), `authReady` flips true once we've checked for an existing session on load, and `user`
// derives the signed-in user. Magic-link (passwordless) sign-in: the player enters an email, gets a
// link, and clicking it returns them to the app already authenticated.

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

/** Email a one-time magic link to an INVITED tester (no new accounts are created here — invites are
 *  issued from the Supabase dashboard). Returns { error } — null on success. */
export async function sendMagicLink(email) {
  if (!supabaseReady) return { error: "Sign-in isn't configured yet." };
  const clean = (email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { error: "Enter a valid email address." };
  const { error } = await supabase.auth.signInWithOtp({
    email: clean,
    options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
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

export async function signOut() {
  if (supabaseReady) { try { await supabase.auth.signOut(); } catch { /* ignore */ } }
  session.set(null);
}
