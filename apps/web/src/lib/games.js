// Online lobby data layer. A "game" is a row in Supabase; players claim rows in game_seats. While
// you're in a lobby we subscribe to Realtime so seats appear/leave live. The actual turn-by-turn
// game sync (the RemoteTransport) is the next phase — here we get people into the same room.

import { writable, get } from "svelte/store";
import { supabase, supabaseReady } from "./supabase.js";
import { user } from "./auth.js";
import { myProfile } from "./social.js";
import economy from "@boty/engine/data/economy.json";

const TRADES = economy.services ?? [];
// The first trade no seat has taken — so a joining human starts with a trade (never "unassigned"),
// which they can still switch in the lobby.
const firstFreeTrade = (seats) => TRADES.find((t) => !(seats ?? []).some((s) => s.trade === t)) ?? null;

export const onlineGame = writable(null);   // the current games row (or null)
export const onlineSeats = writable([]);    // game_seats rows for it, ordered by seat
export const lobbyBusy = writable(false);   // a request is in flight
export const lobbyError = writable(null);   // last error to show
export const lobbyNote = writable(null);    // a friendly, non-error message

const MAX_SEATS = 6;
let channel = null;

const fail = (e) => { lobbyError.set(typeof e === "string" ? e : (e?.message ?? String(e))); lobbyBusy.set(false); return null; };
const nameOf = () => get(myProfile)?.username ?? (get(user)?.email ?? "player").split("@")[0]; // show the username, never the email
function genCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let s = ""; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
  return `MAPLE-${s}`;
}
const firstOpenSeat = (seats) => { const t = new Set(seats.map((s) => s.seat)); let n = 0; while (t.has(n)) n++; return n; };

/** Claim the next open seat, resilient to a race: two clients (or rapid Add-AI clicks) can compute the
 *  SAME open seat off a stale seat list and collide on the (game_id, seat) unique index (a 409). So
 *  refetch the LIVE seats each attempt and, on a unique-violation, loop to grab the next free one.
 *  `rowFor(seat)` returns the extra columns. Returns the claimed seat, or -1 if the lobby is full. */
async function claimSeat(gameId, rowFor) {
  for (let tries = 0; tries < 8; tries++) {
    const { data: seats } = await supabase.from("game_seats").select("seat").eq("game_id", gameId);
    const seat = firstOpenSeat(seats ?? []);
    if (seat >= MAX_SEATS) return -1;
    const { error } = await supabase.from("game_seats").insert({ game_id: gameId, seat, ...rowFor(seat) });
    if (!error) return seat;
    if (error.code !== "23505" && !/duplicate|unique|conflict/i.test(error.message ?? "")) throw error; // a real error, not a seat race
    // else: someone took that seat between fetch and insert — refetch and try the next one
  }
  throw new Error("The lobby's busy filling seats — try again.");
}

/** Host a new game — creates the row, claims seat 0, and drops you into its lobby. */
export async function hostGame(difficulty = "standard") {
  if (!supabaseReady) return fail("Online play isn't configured.");
  const me = get(user); if (!me) return fail("Sign in first.");
  if (!get(myProfile)?.licensed) return fail("Hosting multiplayer needs the full license. You can still play solo and join any game for free."); // server RLS also enforces this
  lobbyError.set(null); lobbyNote.set(null); lobbyBusy.set(true);
  let game = null;
  for (let tries = 0; tries < 5 && !game; tries++) {
    const { data, error } = await supabase.from("games").insert({ code: genCode(), difficulty }).select().single();
    if (!error) game = data;
    else if (!/duplicate|unique/i.test(error.message)) return fail(error);
  }
  if (!game) return fail("Couldn't reserve a game code — try again.");
  const { error: se } = await supabase.from("game_seats").insert({ game_id: game.id, seat: 0, user_id: me.id, display_name: nameOf(), trade: firstFreeTrade([]) });
  if (se) return fail(se);
  await enterGame(game);
  lobbyBusy.set(false);
}

/** Join an existing lobby by its code. */
export async function joinByCode(rawCode) {
  if (!supabaseReady) return fail("Online play isn't configured.");
  const me = get(user); if (!me) return fail("Sign in first.");
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) return fail("Enter a game code.");
  lobbyError.set(null); lobbyNote.set(null); lobbyBusy.set(true);
  const { data: game, error } = await supabase.from("games").select("*").eq("code", code).eq("status", "lobby").maybeSingle();
  if (error) return fail(error);
  if (!game) return fail("No open game with that code.");
  const { data: seats } = await supabase.from("game_seats").select("*").eq("game_id", game.id);
  if (!(seats ?? []).some((s) => s.user_id === me.id)) { // not already seated
    try { if (await claimSeat(game.id, () => ({ user_id: me.id, display_name: nameOf(), trade: firstFreeTrade(seats ?? []) })) < 0) return fail("That game is full."); }
    catch (e) { return fail(e); }
  }
  await enterGame(game);
  lobbyBusy.set(false);
}

/** Pick your trade (each trade can be taken once — the UI offers only free ones). */
export async function pickTrade(trade) {
  const g = get(onlineGame), me = get(user); if (!g || !me) return;
  await supabase.from("game_seats").update({ trade }).eq("game_id", g.id).eq("user_id", me.id);
  await refreshSeats(g.id);
}

/** Host: set (or clear, with null) a specific seat's trade — used to pin a CPU seat. RLS lets the
 *  host write any seat; an empty trade means "auto", filled from the free trades at Start. */
export async function setSeatTrade(seat, trade) {
  const g = get(onlineGame); if (!g) return;
  await supabase.from("game_seats").update({ trade: trade || null }).eq("game_id", g.id).eq("seat", seat);
  await refreshSeats(g.id);
}

/** Host: add a CPU seat. */
export async function addAiSeat() {
  const g = get(onlineGame); if (!g) return;
  try { if (await claimSeat(g.id, (s) => ({ is_ai: true, display_name: `CPU ${s + 1}` })) < 0) return; }
  catch (e) { return fail(e); }
  await refreshSeats(g.id);
}

/** Host: remove a seat (kick a player or drop a CPU). */
export async function removeSeat(seat) {
  const g = get(onlineGame); if (!g) return;
  await supabase.from("game_seats").delete().eq("game_id", g.id).eq("seat", seat);
  await refreshSeats(g.id);
}

/** Leave — behaviour depends on whether the game has STARTED:
 *  • In the lobby (pre-start): the host closes the room; a guest frees their seat (as before).
 *  • Mid-game (active/paused): NON-DESTRUCTIVE. Keep the row AND my seat so I can resume later — I just
 *    stop heartbeating, so I go "absent" and the host's bot covers my turns. (A leaving host is handled
 *    by host-migration on the other clients.) This is the "Save & leave" path. */
export async function leaveGame() {
  const g = get(onlineGame), me = get(user);
  if (g && me && g.status === "lobby") {
    if (g.host_id === me.id) await supabase.from("games").delete().eq("id", g.id);
    else await supabase.from("game_seats").delete().eq("game_id", g.id).eq("user_id", me.id);
  }
  teardown(); // drop this client's transport either way; the row/seat persist for an active game
}

/** Host: end a game for good — it drops off everyone's Resume list. (Distinct from Save & leave.) */
export async function endGame() {
  const g = get(onlineGame), me = get(user);
  if (g && me && g.host_id === me.id) await supabase.from("games").update({ status: "done" }).eq("id", g.id);
  teardown();
}

/** Resume a game you still hold a seat in (chosen from the Resume list). Re-enters its room + transport;
 *  the store rebuilds the engine from the move log, and the host reclaims your seat on your next turn. */
export async function resumeGame(row) {
  if (!supabaseReady) return fail("Online play isn't configured.");
  lobbyError.set(null); lobbyNote.set(null);
  await enterGame(row);
}

/** Replace the seat rows with a contiguous 0..n-1 set (called at Start). Keeps the engine's seat
 *  index == game_seats.seat, which the RLS turn-lock relies on even if someone left a gap. */
export async function replaceSeats(seats) {
  const g = get(onlineGame); if (!g) return;
  await supabase.from("game_seats").delete().eq("game_id", g.id);
  await supabase.from("game_seats").insert(seats.map((s) => ({ game_id: g.id, seat: s.seat, user_id: s.user_id, display_name: s.name, trade: s.trade, is_ai: s.is_ai })));
}

/** Write game state/status to the row (the sync primitive). RLS lets the host or the active player
 *  through. Used by the store's online transport to persist the seed + move log + whose turn it is. */
export async function writeGameState(patch) {
  const g = get(onlineGame); if (!g) return { error: "no game" };
  const { error } = await supabase.from("games").update(patch).eq("id", g.id);
  return { error: error?.message ?? null };
}

/** Read the current game row fresh. The store polls this as a fallback for Realtime messages that
 *  never arrive (a dropped channel, a flaky link) — without it, a single missed update wedges the
 *  deterministic lockstep forever. Returns the row, or null on any error (the next poll retries). */
export async function fetchGameRow() {
  const g = get(onlineGame); if (!g) return null;
  const { data, error } = await supabase.from("games").select("*").eq("id", g.id).maybeSingle();
  return error ? null : data;
}

// --- Presence (Phase 3.7): heartbeat, seat snapshot, host hand-off, resume list ---------------

/** Stamp MY seat's heartbeat via the server-side RPC so last_seen is the DB clock (now()), NOT this
 *  device's wall clock. Critical: presence is judged by comparing seats' last_seen, so if each device
 *  stamped its OWN clock, two phones a few seconds apart would read each other as "absent" and boot a
 *  live player. The RPC is security-definer, so it also can't be blocked by an RLS edge case. */
export async function heartbeatSeat() {
  const g = get(onlineGame), me = get(user); if (!g || !me) return;
  const { error } = await supabase.rpc("heartbeat", { g: g.id });
  // Transitional fallback: if the heartbeat RPC isn't in the DB yet (schema v3.1 not re-run), still
  // stamp last_seen the old way so clients don't ALL read as absent and trigger mass takeovers. Once
  // the RPC exists, the server clock is used and cross-device presence is correct.
  if (error) await supabase.from("game_seats").update({ last_seen: new Date().toISOString() }).eq("game_id", g.id).eq("user_id", me.id);
}

/** Claim the active session for MY seat (single-session lock). Stamps this tab's token on the seat;
 *  the same account's other tabs then see a different token and go read-only. RLS admits my own seat. */
export async function claimSession(token) {
  const g = get(onlineGame), me = get(user); if (!g || !me) return;
  await supabase.from("game_seats").update({ session_id: token }).eq("game_id", g.id).eq("user_id", me.id);
}

/** Remove a game from MY Resume list: if I host it, close it for everyone (delete the row); otherwise
 *  just give up my seat (so my_games no longer returns it for me). */
export async function removeGame(row) {
  const me = get(user); if (!me || !row) return;
  if (row.host_id === me.id) await supabase.from("games").delete().eq("id", row.id);
  else await supabase.from("game_seats").delete().eq("game_id", row.id).eq("user_id", me.id);
}

/** Read all seats (with last_seen) for the current game — the store's presence tick uses this to decide
 *  host election (is the host's heartbeat stale?) and AI-takeover (is the active seat absent?). */
export async function fetchSeats() {
  const g = get(onlineGame); if (!g) return [];
  const { data } = await supabase.from("game_seats").select("*").eq("game_id", g.id).order("seat");
  return data ?? [];
}

/** Ask the server to hand me the host role IF the current host's heartbeat is stale (RPC enforces it,
 *  security-definer so RLS can't block the games.host_id rewrite). Returns the effective host_id. */
export async function claimHost() {
  const g = get(onlineGame); if (!g) return null;
  const { data, error } = await supabase.rpc("claim_host", { g: g.id });
  if (error) throw error;
  return data;
}

/** My in-flight (active|paused) games where I hold a seat — powers the Resume list. */
export async function myGames() {
  if (!supabaseReady) return [];
  const { data, error } = await supabase.rpc("my_games");
  return error ? [] : (data ?? []);
}

// --- internals -------------------------------------------------------------------------------
async function enterGame(game) {
  onlineGame.set(game);
  await refreshSeats(game.id);
  subscribe(game.id);
}

async function refreshSeats(gameId) {
  const { data } = await supabase.from("game_seats").select("*").eq("game_id", gameId).order("seat");
  onlineSeats.set(data ?? []);
}

function subscribe(gameId) {
  if (channel) supabase.removeChannel(channel);
  channel = supabase
    .channel(`game:${gameId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "game_seats", filter: `game_id=eq.${gameId}` }, () => refreshSeats(gameId))
    .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, (p) => {
      if (p.eventType === "DELETE") { lobbyNote.set("The host closed the lobby."); teardown(); }
      else onlineGame.set(p.new);
    })
    .subscribe();
}

function teardown() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  onlineGame.set(null); onlineSeats.set([]); lobbyError.set(null);
}
