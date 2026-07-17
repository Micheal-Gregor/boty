-- ============================================================================
-- BOTY — online multiplayer schema (v1)
-- Run in Supabase: Dashboard → SQL Editor → New query → paste all → Run.
--
-- Model: turn-based, client-authoritative. The entire engine state lives as JSON
-- in games.state; only the player whose turn it is (or the host) may write it,
-- enforced by Row Level Security. Clients subscribe via Realtime for live updates.
-- ============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

-- A game session ----------------------------------------------------------------
create table if not exists public.games (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,                    -- short join code, e.g. "MAPLE-7F3K"
  host_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status      text not null default 'lobby' check (status in ('lobby', 'active', 'done')),
  state       jsonb,                                   -- the full serialized engine state (null in lobby)
  active_seat integer,                                 -- whose turn it is (seat index)
  difficulty  text not null default 'standard',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Who's sitting where -----------------------------------------------------------
create table if not exists public.game_seats (
  game_id      uuid not null references public.games (id) on delete cascade,
  seat         integer not null,
  user_id      uuid references auth.users (id) on delete set null, -- null = open / AI
  display_name text,
  trade        text,
  is_ai        boolean not null default false,
  primary key (game_id, seat)
);

alter table public.games enable row level security;
alter table public.game_seats enable row level security;

-- Are you seated in this game? (security definer so the games policies don't recurse into RLS.)
create or replace function public.is_player(g uuid)
  returns boolean language sql security definer stable
  set search_path = public as $$
  select exists (select 1 from public.game_seats s where s.game_id = g and s.user_id = auth.uid());
$$;

-- GAMES policies ----------------------------------------------------------------
drop policy if exists games_select on public.games;
create policy games_select on public.games for select to authenticated
  using (status = 'lobby' or public.is_player(id));            -- read open lobbies, or games you're in

drop policy if exists games_insert on public.games;
create policy games_insert on public.games for insert to authenticated
  with check (host_id = auth.uid());                           -- you create games as yourself

drop policy if exists games_update on public.games;
create policy games_update on public.games for update to authenticated
  using (                                                      -- WHO may write: the host or the player whose turn it is now
    host_id = auth.uid()
    or exists (select 1 from public.game_seats s
               where s.game_id = id and s.seat = active_seat and s.user_id = auth.uid())
  )
  with check (true);                                           -- once allowed, they may write the next state — incl. handing active_seat to the next player
                                                               -- (without this, Postgres reuses USING as the check and rejects the turn-handoff: 403 "new row violates RLS")

drop policy if exists games_delete on public.games;
create policy games_delete on public.games for delete to authenticated
  using (host_id = auth.uid());

-- SEATS policies ----------------------------------------------------------------
drop policy if exists seats_select on public.game_seats;
create policy seats_select on public.game_seats for select to authenticated using (true);

-- Claim/leave your OWN seat; the host may manage any seat (add AI, assign, kick).
drop policy if exists seats_write on public.game_seats;
create policy seats_write on public.game_seats for all to authenticated
  using       (user_id = auth.uid() or exists (select 1 from public.games g where g.id = game_id and g.host_id = auth.uid()))
  with check  (user_id = auth.uid() or exists (select 1 from public.games g where g.id = game_id and g.host_id = auth.uid()));

-- Live updates ------------------------------------------------------------------
-- Wrapped so re-running is safe: "already a member of publication" (42710) is swallowed instead of
-- aborting the whole script in the SQL editor.
do $$ begin alter publication supabase_realtime add table public.games;      exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.game_seats; exception when duplicate_object then null; end $$;

-- ============================================================================
-- BOTY — social layer (v2): public usernames, friends, invites, leaderboard.
-- Re-runnable: paste the WHOLE file again any time; everything here is idempotent.
-- Real emails stay private in auth.users — only the username is ever shown.
-- ============================================================================
create extension if not exists citext; -- case-insensitive unique usernames

-- A public handle per signed-in user, plus their lifetime record (the leaderboard).
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     citext unique not null
                 check (char_length(username::text) between 3 and 20 and username::text ~ '^[A-Za-z0-9_]+$'),
  games_played integer not null default 0,
  games_won    integer not null default 0,
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true); -- everyone sees usernames + the board
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Friend requests; status flips to 'accepted' when the addressee says yes.
create table if not exists public.friendships (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null references auth.users (id) on delete cascade,
  addressee  uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);
alter table public.friendships enable row level security;
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships for select to authenticated using (requester = auth.uid() or addressee = auth.uid());
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships for insert to authenticated with check (requester = auth.uid());
drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships for update to authenticated using (addressee = auth.uid() or requester = auth.uid()) with check (addressee = auth.uid() or requester = auth.uid());
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships for delete to authenticated using (requester = auth.uid() or addressee = auth.uid());

-- A host nudging a friend to join their lobby (the friend sees it live + can jump in).
create table if not exists public.game_invites (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games (id) on delete cascade,
  from_user  uuid not null references auth.users (id) on delete cascade,
  to_user    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_id, to_user)
);
alter table public.game_invites enable row level security;
drop policy if exists invites_select on public.game_invites;
create policy invites_select on public.game_invites for select to authenticated using (to_user = auth.uid() or from_user = auth.uid());
drop policy if exists invites_insert on public.game_invites;
create policy invites_insert on public.game_invites for insert to authenticated with check (from_user = auth.uid());
drop policy if exists invites_delete on public.game_invites;
create policy invites_delete on public.game_invites for delete to authenticated using (to_user = auth.uid() or from_user = auth.uid());

-- Leaderboard write: each client bumps its OWN record at game end (atomic, RLS-safe via the uid).
create or replace function public.record_result(won boolean)
  returns void language sql security definer set search_path = public as $$
  update public.profiles
     set games_played = games_played + 1,
         games_won    = games_won + (case when won then 1 else 0 end)
   where id = auth.uid();
$$;

do $$ begin alter publication supabase_realtime add table public.game_invites; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.friendships;  exception when duplicate_object then null; end $$;

-- ============================================================================
-- BOTY — session resilience (v3): presence heartbeat, host hand-off, resume.
-- Re-runnable: paste the WHOLE file again any time; everything here is idempotent.
--
-- The engine already treats a "taken-over" seat as a recorded move (aiControlled),
-- so the AUTHORITY question — who is allowed to write the takeover/turn-advance —
-- stays exactly as before (host or active seat). This block only adds the TRIGGERS:
--   • a per-seat heartbeat so clients can tell who's actually connected,
--   • a status the Resume list can filter on ('paused'),
--   • an RLS-safe way to hand off the host when the host's device goes dark,
--   • a clean "my games" lookup for the Resume list.
-- Presence is never part of replayed game state — it only decides who records moves.
-- ============================================================================

-- Heartbeat: each client stamps its own seat every ~2.5s. A null/stale last_seen = that player is
-- absent → their seat gets AI-taken-over by the host.
alter table public.game_seats add column if not exists last_seen timestamptz;

-- Stamp the caller's heartbeat with the SERVER clock (now()), not the device clock — so presence is
-- judged consistently across devices whose wall clocks disagree (else a live player reads as "absent"
-- and gets booted). Security-definer so it also can't be blocked by an RLS edge case.
create or replace function public.heartbeat(g uuid)
  returns void language sql security definer set search_path = public as $$
  update public.game_seats set last_seen = now() where game_id = g and user_id = auth.uid();
$$;

-- Allow a 'paused' game (the Resume list labels it; set when the last connected human leaves).
alter table public.games drop constraint if exists games_status_check;
alter table public.games add  constraint games_status_check check (status in ('lobby', 'active', 'paused', 'done'));

-- Host hand-off: if the current host's heartbeat is missing or stale, a seated player may claim host.
-- Security definer so it can rewrite games.host_id without loosening the games_update policy. The
-- store only calls this when *I* am the lowest-seat connected human, so a double-claim is rare and
-- self-corrects (last write wins on host_id, re-checked next tick). Returns the effective host_id.
create or replace function public.claim_host(g uuid)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  cur_host  uuid;
  host_seen timestamptz;
begin
  if not public.is_player(g) then
    return null;                                    -- only a seated player may take the host role
  end if;
  select host_id into cur_host from public.games where id = g;
  if cur_host is null or cur_host = auth.uid() then
    return cur_host;                                -- nothing to do / already host
  end if;
  select max(last_seen) into host_seen              -- the current host's own seat heartbeat
    from public.game_seats where game_id = g and user_id = cur_host;
  if host_seen is null or host_seen < now() - interval '30 seconds' then
    update public.games set host_id = auth.uid(), updated_at = now() where id = g;
    return auth.uid();
  end if;
  return cur_host;                                  -- host is still alive — no hand-off
end;
$$;

-- The Resume list: the caller's in-flight games where they hold a seat. RLS already permits reading
-- these (is_player), but a definer RPC avoids a client-side seat→game join and returns them directly.
create or replace function public.my_games()
  returns setof public.games language sql security definer stable set search_path = public as $$
  select g.* from public.games g
   where g.status in ('active', 'paused')
     and exists (select 1 from public.game_seats s where s.game_id = g.id and s.user_id = auth.uid())
   order by g.updated_at desc;
$$;

-- ============================================================================
-- BOTY — licensing (v3.2): a one-time lifetime license unlocks HOSTING and being a game's
-- host-authority. Free players play solo, JOIN any game, and reclaim their own seat if they drop.
-- Re-runnable/additive. Grant a license by hand (dashboard) for now; a Stripe webhook can set it later.
--
-- ROLLOUT ORDER MATTERS: flag your host accounts `licensed = true` BEFORE this gate goes live, or no
-- one can host. e.g.  update public.profiles set licensed = true where username = 'yourname';
-- ============================================================================
alter table public.profiles add column if not exists licensed boolean not null default false;
-- profiles_select is already `using (true)`, so co-players can read who's licensed (needed to pick the
-- next host / decide to pause). It's not sensitive. But profiles_update lets a user edit their OWN row —
-- which would let them self-license. Block that: a normal signed-in client can never flip `licensed`;
-- only the service role (dashboard SQL / future webhook) may. Superuser/service updates pass through.
create or replace function public.protect_licensed() returns trigger language plpgsql security definer as $$
begin
  -- current_user is the effective role: PostgREST client requests run as 'authenticated'/'anon', while
  -- the dashboard SQL editor + the service-role key run as 'postgres'/'service_role'. So a signed-in
  -- client can't flip its own license, but you (dashboard) or a future Stripe webhook still can. Using
  -- current_user (a SQL built-in) instead of auth.role() keeps this portable across Postgres setups.
  if new.licensed is distinct from old.licensed and current_user in ('authenticated', 'anon') then
    new.licensed := old.licensed; -- silently ignore a client's attempt to grant itself a license
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_licensed on public.profiles;
create trigger trg_protect_licensed before update on public.profiles for each row execute function public.protect_licensed();

-- Small helper: is the CALLER licensed? (security definer so it reads profiles regardless of RLS.)
create or replace function public.am_licensed()
  returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select licensed from public.profiles where id = auth.uid()), false);
$$;

-- HOSTING is licensed-only: a free player literally cannot create a game row (client also gates for UX).
drop policy if exists games_insert on public.games;
create policy games_insert on public.games for insert to authenticated
  with check (host_id = auth.uid() and public.am_licensed());

-- HOST-AUTHORITY is licensed-only: only a licensed player may take over hosting. If no licensed player
-- is present when the host drops, nobody claims it → the game simply waits (saved) for one to return —
-- it is never handed to free players. (Redefines the v3 claim_host with the extra guard.)
create or replace function public.claim_host(g uuid)
  returns uuid language plpgsql security definer set search_path = public as $$
declare
  cur_host  uuid;
  host_seen timestamptz;
begin
  if not public.is_player(g) then return null; end if;              -- only a seated player
  if not public.am_licensed() then                                  -- free players can't be the host
    select host_id into cur_host from public.games where id = g;
    return cur_host;
  end if;
  select host_id into cur_host from public.games where id = g;
  if cur_host is null or cur_host = auth.uid() then return cur_host; end if;
  select max(last_seen) into host_seen from public.game_seats where game_id = g and user_id = cur_host;
  if host_seen is null or host_seen < now() - interval '30 seconds' then
    update public.games set host_id = auth.uid(), updated_at = now() where id = g;
    return auth.uid();
  end if;
  return cur_host;
end;
$$;
