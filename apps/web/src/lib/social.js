// Social layer — public usernames, friends, game invites, and the leaderboard. Everything is gated on
// supabaseReady and the signed-in user; offline it just stays empty. Real emails never leave
// auth.users — only the username is ever read or shown. Profiles load automatically on sign-in.
import { writable, get, derived } from "svelte/store";
import { supabase, supabaseReady } from "./supabase.js";
import { user } from "./auth.js";

export const myProfile = writable(null);      // { id, username, games_played, games_won, licensed } | null
export const licensed = derived(myProfile, ($p) => !!$p?.licensed); // the $5 lifetime license: host + host-authority
export const needsUsername = writable(false); // signed in but no profile yet → prompt for a username
export const friends = writable([]);          // [{ id, username }]
export const friendRequests = writable([]);   // incoming pending: [{ rowId, id, username }]
export const gameInvites = writable([]);      // incoming, open: [{ id, gameId, code, fromName }]

const meId = () => get(user)?.id ?? null;
let subbed = false;

/** Load my profile after sign-in (or detect that I still need to pick a username). Resilient to a
 *  transient failure (e.g. PostgREST's schema cache still warming after the tables were created): on an
 *  ERROR we retry rather than treating it as "no profile" — which would wrongly pop the name prompt. */
export async function loadProfile(attempt = 0) {
  if (!supabaseReady || !meId()) { myProfile.set(null); needsUsername.set(false); friends.set([]); friendRequests.set([]); gameInvites.set([]); return; }
  const { data, error } = await supabase.from("profiles").select("*").eq("id", meId()).maybeSingle();
  if (error) { if (attempt < 4) setTimeout(() => loadProfile(attempt + 1), 1500); return; } // transient — retry, don't false-prompt
  myProfile.set(data ?? null);
  needsUsername.set(!data); // a clean "no row" → you genuinely need to pick a username
  if (data) { refreshFriends(); refreshInvites(); subscribe(); }
}

/** Claim/keep a username (first sign-in). 3–20 of [A-Za-z0-9_]. */
export async function setUsername(raw) {
  const username = (raw ?? "").trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return { error: "3–20 letters, numbers, or underscores." };
  const { data, error } = await supabase.from("profiles").upsert({ id: meId(), username }).select().single();
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "That username's already taken." : error.message };
  myProfile.set(data); needsUsername.set(false); refreshFriends(); refreshInvites(); subscribe();
  return { error: null };
}

async function namesFor(ids) {
  if (!ids.length) return {};
  const { data } = await supabase.from("profiles").select("id, username").in("id", ids);
  return Object.fromEntries((data ?? []).map((p) => [p.id, p.username]));
}

export async function refreshFriends() {
  if (!supabaseReady || !meId()) return;
  const { data } = await supabase.from("friendships").select("*").or(`requester.eq.${meId()},addressee.eq.${meId()}`);
  const rows = data ?? [];
  const other = (r) => (r.requester === meId() ? r.addressee : r.requester);
  const names = await namesFor([...new Set(rows.map(other))]);
  friends.set(rows.filter((r) => r.status === "accepted").map((r) => ({ id: other(r), username: names[other(r)] ?? "player" })));
  friendRequests.set(rows.filter((r) => r.status === "pending" && r.addressee === meId()).map((r) => ({ rowId: r.id, id: r.requester, username: names[r.requester] ?? "player" })));
}

export async function sendFriendRequest(username) {
  const name = (username ?? "").trim();
  if (!name) return { error: "Enter a username." };
  const { data: p } = await supabase.from("profiles").select("id").eq("username", name).maybeSingle();
  if (!p) return { error: "No player with that username." };
  if (p.id === meId()) return { error: "That's you." };
  const { error } = await supabase.from("friendships").insert({ requester: meId(), addressee: p.id });
  if (error) return { error: /duplicate|unique/i.test(error.message) ? "You've already requested or befriended them." : error.message };
  return { error: null };
}

export async function acceptRequest(rowId) { await supabase.from("friendships").update({ status: "accepted" }).eq("id", rowId); refreshFriends(); }
export async function removeFriend(otherId) {
  await supabase.from("friendships").delete().or(`and(requester.eq.${meId()},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${meId()})`);
  refreshFriends();
}

export async function leaderboard() {
  if (!supabaseReady) return [];
  const { data } = await supabase.from("profiles").select("username, games_won, games_played")
    .order("games_won", { ascending: false }).order("games_played", { ascending: true }).limit(50);
  return data ?? [];
}

export async function refreshInvites() {
  if (!supabaseReady || !meId()) return;
  const { data } = await supabase.from("game_invites").select("id, game_id, from_user").eq("to_user", meId());
  const rows = data ?? [];
  if (!rows.length) { gameInvites.set([]); return; }
  const names = await namesFor([...new Set(rows.map((r) => r.from_user))]);
  const { data: gs } = await supabase.from("games").select("id, code, status").in("id", rows.map((r) => r.game_id));
  const game = Object.fromEntries((gs ?? []).map((g) => [g.id, g]));
  gameInvites.set(rows.filter((r) => game[r.game_id]?.status === "lobby").map((r) => ({ id: r.id, gameId: r.game_id, code: game[r.game_id].code, fromName: names[r.from_user] ?? "a friend" })));
}

export async function inviteFriend(gameId, toUserId) {
  const { error } = await supabase.from("game_invites").insert({ game_id: gameId, from_user: meId(), to_user: toUserId });
  return { error: error && !/duplicate|unique/i.test(error.message) ? error.message : null };
}
export async function dismissInvite(id) { await supabase.from("game_invites").delete().eq("id", id); refreshInvites(); }

/** Best-effort: bump my lifetime record at game end (each client records its own — the leaderboard). */
export async function recordResult(won) {
  if (!supabaseReady || !meId()) return;
  try { await supabase.rpc("record_result", { won: !!won }); } catch { /* leaderboard is best-effort */ }
}

// Live: a new invite or friend change refreshes the relevant list. (Set up once, after the first load.)
function subscribe() {
  if (subbed || !supabaseReady) return;
  subbed = true;
  supabase.channel("social")
    .on("postgres_changes", { event: "*", schema: "public", table: "game_invites", filter: `to_user=eq.${meId()}` }, refreshInvites)
    .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, refreshFriends)
    .subscribe();
}

if (supabaseReady) user.subscribe(() => loadProfile()); // load/clear my profile whenever sign-in changes
