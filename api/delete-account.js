// Vercel serverless function: permanently delete the signed-in user's account. Google Play REQUIRES a
// deletion path for any app that lets users create accounts. Deleting the auth.users row CASCADES
// through the schema — profiles, friendships, game_invites and hosted games are removed, and the user's
// game_seats are freed to open/AI (see the `on delete cascade`/`set null` FKs in supabase/schema.sql) —
// so this single admin call erases all their personal data. Needs the SERVICE-ROLE key (only the admin
// API can delete a user); the anon key validates the caller so a user can only ever delete THEMSELVES.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
const SUPABASE_ANON = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)?.trim();
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!SUPABASE_URL || !SUPABASE_ANON || !SERVICE_ROLE)
    return res.status(500).json({ error: "Account deletion isn't configured." });
  try {
    // Only ever delete the CALLER. Validate their access token — never trust a client-supplied id.
    const authz = req.headers.authorization || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Sign in first." });
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON);
    const { data: { user } = {}, error } = await anon.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: "Invalid session." });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
    if (delErr) {
      console.error("[delete-account]", delErr.message);
      return res.status(500).json({ error: "Couldn't delete the account — please try again, or email support." });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[delete-account]", e?.message ?? e);
    return res.status(500).json({ error: "Couldn't delete the account." });
  }
}
