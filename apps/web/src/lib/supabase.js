// Supabase client. Reads the project URL + anon key from the (gitignored) .env via Vite's
// import.meta.env. If they're absent the client is null and `supabaseReady` is false, so the rest
// of the app can fall back to local/guest play instead of crashing — auth is additive, not required.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseReady = !!(url && anonKey);

export const supabase = supabaseReady
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,      // keep the session in localStorage across reloads
        autoRefreshToken: true,    // refresh the JWT before it expires
        detectSessionInUrl: true,  // pick up the tokens a magic link drops in the URL on return
      },
    })
  : null;
