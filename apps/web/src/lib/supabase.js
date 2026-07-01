// Supabase client. Reads the project URL + anon key from the (gitignored) .env via Vite's
// import.meta.env. If they're absent the client is null and `supabaseReady` is false, so the rest
// of the app can fall back to local/guest play instead of crashing — auth is additive, not required.

import { createClient } from "@supabase/supabase-js";
import { makeMockSupabase } from "./supabase-mock.js";

// DEV ONLY: ?mock=1 swaps in a localStorage-backed fake backend (no auth, no Supabase) so two browser
// tabs of the same browser can play an online-style game locally — the foundation for the two-tab E2E.
// Per-tab identity is the ?user= param. See supabase-mock.js.
const useMock = !!import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).get("mock") === "1";

// .trim() defends against a trailing newline/space sneaking in when the values are pasted into a host's
// env-var UI — a stray "\n" on the anon key survives into the Realtime WebSocket URL as "%0A", making
// the JWT invalid so the socket endlessly fails to connect (REST/login tolerates it; Realtime doesn't).
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseReady = useMock || !!(url && anonKey);

export const supabase = useMock
  ? makeMockSupabase()
  : supabaseReady
    ? createClient(url, anonKey, {
        auth: {
          persistSession: true,      // keep the session in localStorage across reloads
          autoRefreshToken: true,    // refresh the JWT before it expires
          detectSessionInUrl: true,  // pick up the tokens a magic link drops in the URL on return
        },
      })
    : null;
