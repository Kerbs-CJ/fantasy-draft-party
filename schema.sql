-- Fantasy Draft Party — Supabase schema
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.

create extension if not exists pgcrypto;

create table if not exists rooms (
  code text primary key,
  status text not null default 'lobby',
  game_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references rooms(code) on delete cascade,
  name text not null,
  is_host boolean not null default false,
  joined_at timestamptz not null default now()
);

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references rooms(code) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  game_index int not null,
  round_index int, -- which question/round within the game (e.g. missing-club journey #, guess player #)
  points numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table rooms enable row level security;
alter table players enable row level security;
alter table scores enable row level security;

-- Open policies: this is a small private party app for friends, gated only by
-- a room code, not real auth. Anyone holding your deployed page's anon key
-- (which is meant to be public) can read/write these tables. Fine for a fun
-- casual app; don't put anything sensitive in it.
drop policy if exists "public read rooms" on rooms;
drop policy if exists "public write rooms" on rooms;
drop policy if exists "public update rooms" on rooms;
create policy "public read rooms" on rooms for select using (true);
create policy "public write rooms" on rooms for insert with check (true);
create policy "public update rooms" on rooms for update using (true) with check (true);

drop policy if exists "public read players" on players;
drop policy if exists "public write players" on players;
create policy "public read players" on players for select using (true);
create policy "public write players" on players for insert with check (true);

drop policy if exists "public read scores" on scores;
drop policy if exists "public write scores" on scores;
create policy "public read scores" on scores for select using (true);
create policy "public write scores" on scores for insert with check (true);

-- Turn on realtime change streaming for these tables.
-- If this errors saying the table is already a member, that's fine — ignore it.
-- (Alternatively: Database → Replication → toggle these three tables on.)
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table scores;

-- ── Draft Tracker ────────────────────────────────────────────
-- A separate page (draft-tracker.html), reached from the reveal screen,
-- for tracking an actual Premier League fantasy draft after the party's
-- draft ORDER has been decided. Reuses the same room/players tables (a
-- drafter is just one of the existing `players` rows) — this table is
-- only the picks themselves. `pl_player_id` is a Premier League player's
-- id from the static players.js pool (PL_PLAYERS), not a row in this
-- app's own `players` table — named differently to keep the two kinds
-- of "player" from being confused with each other.
create table if not exists draft_picks (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references rooms(code) on delete cascade,
  pick_number int not null, -- 1-indexed overall pick, drives whose-turn-is-it math client-side
  pl_player_id int not null, -- id into PL_PLAYERS (players.js), i.e. the real footballer taken
  drafter_id uuid not null references players(id) on delete cascade, -- who took them
  created_at timestamptz not null default now(),
  unique (room_code, pl_player_id), -- a footballer can only be drafted once per room
  unique (room_code, pick_number) -- and a pick slot can only be filled once — the safety net against two people submitting the same turn at the same time
);

alter table draft_picks enable row level security;
drop policy if exists "public read draft_picks" on draft_picks;
drop policy if exists "public write draft_picks" on draft_picks;
create policy "public read draft_picks" on draft_picks for select using (true);
create policy "public write draft_picks" on draft_picks for insert with check (true);

alter publication supabase_realtime add table draft_picks;
