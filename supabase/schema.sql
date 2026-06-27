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
  using (                                                      -- only the host or the ACTIVE player writes
    host_id = auth.uid()
    or exists (select 1 from public.game_seats s
               where s.game_id = id and s.seat = active_seat and s.user_id = auth.uid())
  );

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
-- (If these say "already a member of publication", that's fine — ignore.)
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.game_seats;
