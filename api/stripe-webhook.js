// Vercel serverless function: Stripe calls this on payment events. On a completed LICENSE checkout it
// flips profiles.licensed = true using the Supabase SERVICE-ROLE key (which bypasses RLS — a normal
// client can never grant a license). It verifies Stripe's signature against the RAW request body, so a
// forged call can't grant a license. Secrets (Vercel env, never the repo): STRIPE_SECRET_KEY,
// STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY (+ the Supabase URL).
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } }; // Stripe needs the exact raw bytes to verify the signature

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const key = process.env.STRIPE_SECRET_KEY;
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Report WHICH env var is missing (names only — never the values) so a 500 is diagnosable from Stripe's
  // delivery log. If you just added these in Vercel, you must REDEPLOY for the function to see them.
  const missing = [];
  if (!key) missing.push("STRIPE_SECRET_KEY");
  if (!whsec) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!svc) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL) missing.push("SUPABASE_URL (or VITE_SUPABASE_URL)");
  if (missing.length) {
    console.error("[webhook] missing env:", missing.join(", "));
    return res.status(500).json({ error: "Missing env vars (redeploy after adding): " + missing.join(", ") });
  }

  const stripe = new Stripe(key);
  let event;
  try {
    const raw = await readRaw(req);
    event = stripe.webhooks.constructEvent(raw, req.headers["stripe-signature"], whsec);
  } catch (e) {
    console.error("[webhook] bad signature:", e?.message ?? e);
    return res.status(400).json({ error: "Bad signature — check STRIPE_WEBHOOK_SECRET matches this endpoint" });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const userId = s.metadata?.user_id || s.client_reference_id;
    if (s.metadata?.purpose === "license" && userId && s.payment_status === "paid") {
      try {
        const admin = createClient(SUPABASE_URL, svc, { auth: { persistSession: false } });
        const { data, error } = await admin.from("profiles").update({ licensed: true }).eq("id", userId).select("id");
        if (error) throw error;
        if (!data || !data.length) {
          // Paid, but there's no profile row to flag (buyer never picked a username). Don't 500 (Stripe
          // would retry forever) — log it so we can grant it by hand.
          console.error("[webhook] paid but NO profile row for", userId);
          return res.status(200).json({ received: true, warning: "no profile row — license not applied for " + userId });
        }
        console.log("[webhook] licensed", userId);
      } catch (e) {
        console.error("[webhook] license write failed:", e?.message ?? e);
        return res.status(500).json({ error: "DB write failed: " + (e?.message ?? "unknown") }); // 500 → Stripe retries
      }
    }
  }
  return res.status(200).json({ received: true });
}
