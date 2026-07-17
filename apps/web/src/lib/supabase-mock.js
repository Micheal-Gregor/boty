// A localStorage-backed stand-in for the Supabase client — for the two-tab online E2E (and quick local
// multiplayer testing) with NO real backend and NO auth. Two tabs of the SAME browser share
// localStorage; cross-tab "realtime" rides the `storage` event. Identity comes from the ?user= URL
// param. Enabled by ?mock=1 (wired in supabase.js). Implements ONLY the API surface the app uses
// (games / game_seats CRUD + one postgres_changes channel + auth + a couple of social stubs).
//
// NOT for production — it's a test seam. Uses Date.now()/Math.random() freely (browser side, not the
// deterministic engine).

const LS = () => window.localStorage;
const tblKey = (t) => `mock:tbl:${t}`;
const evtKey = (t) => `mock:evt:${t}`;
const readTbl = (t) => { try { return JSON.parse(LS().getItem(tblKey(t)) || "[]"); } catch { return []; } };
const liveChannels = []; // channels open in THIS tab — for self-echo (Supabase echoes a write back to the writer too)
function fireChange(handlers, change) {
  for (const { cfg, cb } of handlers) {
    if (cfg.table !== change.table) continue;
    if (cfg.filter) { const m = /([a-z_]+)=eq\.(.+)/.exec(cfg.filter); const row = change.new ?? change.old; if (m && row && String(row[m[1]]) !== m[2]) continue; }
    cb({ eventType: change.eventType, new: change.new ?? null, old: change.old ?? null });
  }
}
const writeTbl = (t, rows, change) => {
  LS().setItem(tblKey(t), JSON.stringify(rows));
  if (!change) return;
  const ch = { table: t, ...change };
  LS().setItem(evtKey(t), JSON.stringify({ ...ch, _n: `${Date.now()}.${Math.random()}` })); // OTHER tabs, via the storage event
  setTimeout(() => { for (const c of liveChannels) fireChange(c.handlers, ch); }, 0); // THIS tab (self-echo), async like real realtime
};
const myId = () => new URLSearchParams(location.search).get("user") || "guest";
let seq = 0;
const newId = () => `${myId()}_${Date.now()}_${seq++}`;
const ok = (data = null) => ({ data, error: null });
const err = (message, code) => ({ data: null, error: { message, code } });

// DB column defaults the app relies on (the real schema sets these; the mock must too).
const defaultsFor = (t) =>
  t === "games" ? { status: "lobby", host_id: myId(), active_seat: null, state: null, difficulty: "standard" }
  : t === "game_seats" ? { is_ai: false, user_id: null, display_name: null, trade: null }
  : t === "profiles" ? { games_played: 0, games_won: 0 }
  : {};

// A thenable query builder. Each chainable method returns `this`; awaiting runs it against localStorage.
class Query {
  constructor(table) { this.t = table; this.op = "select"; this.payload = null; this.eqs = []; this.ins = []; this._ret = false; this._single = null; this._order = null; }
  select() { if (this.op === "select") this._ret = true; else this._ret = true; return this; }
  insert(v) { this.op = "insert"; this.payload = v; return this; }
  update(v) { this.op = "update"; this.payload = v; return this; }
  delete() { this.op = "delete"; return this; }
  upsert(v) { this.op = "upsert"; this.payload = v; return this; }
  eq(col, val) { this.eqs.push([col, val]); return this; }
  in(col, vals) { this.ins.push([col, vals]); return this; }
  or() { return this; } // social-only; the E2E doesn't exercise friendships
  order(col) { this._order = col; return this; }
  limit() { return this; }
  single() { this._single = "single"; return this; }
  maybeSingle() { this._single = "maybe"; return this; }

  #match(r) { return this.eqs.every(([c, v]) => r[c] === v) && this.ins.every(([c, vs]) => vs.includes(r[c])); }
  #shape(rows) {
    let out = rows;
    if (this._order) out = [...out].sort((a, b) => (a[this._order] > b[this._order] ? 1 : a[this._order] < b[this._order] ? -1 : 0));
    if (this._single === "single") return out.length === 1 ? ok(out[0]) : err(out.length ? "multiple rows" : "no rows", "PGRST116");
    if (this._single === "maybe") return ok(out[0] ?? null);
    return ok(out);
  }
  then(resolve, reject) { return Promise.resolve(this.#run()).then(resolve, reject); }
  #run() {
    const rows = readTbl(this.t);
    if (this.op === "select") return this.#shape(rows.filter((r) => this.#match(r)));
    if (this.op === "insert" || this.op === "upsert") {
      const vals = Array.isArray(this.payload) ? this.payload : [this.payload];
      const made = [];
      for (const v of vals) {
        const row = { ...defaultsFor(this.t), ...v };
        if (this.op === "upsert" && row.id != null) { // upsert by id (profiles)
          const i = rows.findIndex((r) => r.id === row.id);
          if (i >= 0) { rows[i] = { ...rows[i], ...row }; made.push(rows[i]); continue; }
        }
        if (row.id == null && this.t !== "game_seats") row.id = newId(); // games/profiles get an id; game_seats is keyed by (game_id, seat)
        // unique guards the app relies on: games.code, game_seats (game_id, seat)
        if (this.t === "game_seats" && rows.some((r) => r.game_id === row.game_id && r.seat === row.seat)) return err("duplicate key", "23505");
        if (this.t === "games" && row.code && rows.some((r) => r.code === row.code)) return err("duplicate code", "23505");
        rows.push(row); made.push(row);
      }
      writeTbl(this.t, rows, { eventType: "INSERT", new: made[made.length - 1] ?? null });
      return this._ret ? this.#shape(made) : ok(null);
    }
    if (this.op === "update") {
      const hit = rows.filter((r) => this.#match(r));
      for (const r of hit) Object.assign(r, this.payload);
      writeTbl(this.t, rows, { eventType: "UPDATE", new: hit[hit.length - 1] ?? null });
      return this._ret ? this.#shape(hit) : ok(null);
    }
    if (this.op === "delete") {
      const gone = rows.filter((r) => this.#match(r));
      const kept = rows.filter((r) => !this.#match(r));
      writeTbl(this.t, kept, { eventType: "DELETE", old: gone[0] ?? null });
      return ok(null);
    }
    return err("unsupported op");
  }
}

class Channel {
  constructor() { this.handlers = []; this._onStorage = null; }
  on(_evt, cfg, cb) { this.handlers.push({ cfg, cb }); return this; }
  subscribe() {
    this._onStorage = (e) => {
      if (!e.key || !e.key.startsWith("mock:evt:")) return;
      let change; try { change = JSON.parse(e.newValue); } catch { return; }
      fireChange(this.handlers, change); // OTHER tab wrote it
    };
    window.addEventListener("storage", this._onStorage);
    liveChannels.push(this);
    return this;
  }
  _teardown() { if (this._onStorage) window.removeEventListener("storage", this._onStorage); const i = liveChannels.indexOf(this); if (i >= 0) liveChannels.splice(i, 1); }
}

// heartbeat: stamp my seat's last_seen with "server" time (one browser clock here, so skew is moot).
function mockHeartbeat(g) {
  const seats = readTbl("game_seats");
  const me = myId();
  const s = seats.find((x) => x.game_id === g && x.user_id === me);
  if (s) { s.last_seen = new Date().toISOString(); writeTbl("game_seats", seats, { eventType: "UPDATE", new: s }); }
  return null;
}

// claim_host: hand me the host role IF the current host's seat heartbeat is stale (>30s) or missing —
// mirrors the SQL RPC. Used by the two-tab E2E for host migration (a test shrinks the window via URL).
function mockClaimHost(g) {
  const games = readTbl("games");
  const row = games.find((r) => r.id === g);
  if (!row) return null;
  const me = myId();
  if (!row.host_id || row.host_id === me) return row.host_id ?? null;
  const meProfile = readTbl("profiles").find((p) => p.id === me);
  if (!meProfile?.licensed) return row.host_id; // only a LICENSED player may become host
  const seats = readTbl("game_seats").filter((s) => s.game_id === g);
  if (!seats.some((s) => s.user_id === me)) return row.host_id; // only a seated player may claim
  const hostSeat = seats.find((s) => s.user_id === row.host_id);
  const stale = !hostSeat?.last_seen || (Date.now() - new Date(hostSeat.last_seen).getTime()) > 30000;
  if (!stale) return row.host_id;
  row.host_id = me;
  writeTbl("games", games, { eventType: "UPDATE", new: row });
  return me;
}

// my_games: the caller's in-flight games (active|paused) where they hold a seat — powers Resume.
function mockMyGames() {
  const me = myId();
  const mine = new Set(readTbl("game_seats").filter((s) => s.user_id === me).map((s) => s.game_id));
  return readTbl("games").filter((r) => mine.has(r.id) && (r.status === "active" || r.status === "paused"));
}

export function makeMockSupabase() {
  const session = { user: { id: myId(), email: `${myId()}@mock.test` } };
  // Auto-seed a profile so the username prompt never blocks the E2E.
  const profiles = readTbl("profiles");
  if (!profiles.some((p) => p.id === myId())) { profiles.push({ id: myId(), username: myId(), games_played: 0, games_won: 0, licensed: true }); writeTbl("profiles", profiles); } // test users are licensed so hosting works in the E2E
  return {
    __mock: true,
    from: (t) => new Query(t),
    channel: () => new Channel(),
    removeChannel: (ch) => ch?._teardown?.(),
    // Faithful stand-ins for the security-definer RPCs the store calls. record_result stays a no-op.
    rpc: async (fn, args) => {
      if (fn === "heartbeat") return ok(mockHeartbeat(args?.g));
      if (fn === "claim_host") return ok(mockClaimHost(args?.g));
      if (fn === "my_games") return ok(mockMyGames());
      return ok(null);
    },
    auth: {
      getSession: async () => ok({ session }),
      onAuthStateChange: (cb) => { cb("SIGNED_IN", session); return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithOtp: async () => ok(null),
      signOut: async () => ok(null),
    },
  };
}
