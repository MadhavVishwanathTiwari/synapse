-- Synapse — Phase 0: foundation
--
-- Establishes the two tables every later phase depends on (profiles, categories)
-- plus the conventions all subsequent migrations follow:
--
--   * RLS enabled on every table, with policies scoped by auth.uid()
--   * updated_at maintained by trigger, never by application code
--   * colours constrained to the Notion palette defined in globals.css
--
-- Migrations are append-only. Never edit a file that has been applied — add a
-- new one. See docs/CONVENTIONS.md.

-- ---------------------------------------------------------------- extensions

create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------- shared helpers

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Trigger function keeping updated_at authoritative in the database rather than trusting clients.';

-- The Notion palette. Referenced by categories now and by goals in Phase 1, so
-- it lives in one place rather than being repeated as a check constraint.
create type public.notion_color as enum (
  'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'
);

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,

  -- All slot maths happens in UTC; this is only used to project UTC instants
  -- onto the user's local day boundaries and waking window.
  timezone text not null default 'Asia/Kolkata',

  -- The denominator of the coverage metric. Time outside this window is not
  -- expected to be logged and is excluded rather than counted as a gap.
  waking_start time not null default '07:00',
  waking_end   time not null default '23:00',

  -- Half-life in days for every EWMA in the app (adherence, spend, volume load).
  ewma_half_life_days integer not null default 7
    check (ewma_half_life_days between 1 and 90),

  -- Nudges are suppressed inside this window. Stored as local times.
  quiet_hours_start time not null default '22:00',
  quiet_hours_end   time not null default '08:00',

  -- Set during Phase 5 when the Telegram bot is linked.
  telegram_chat_id text,

  currency char(3) not null default 'INR',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Waking window must be a real interval. Overnight windows are not supported
  -- deliberately: they would make "which day does this slot belong to" ambiguous,
  -- and that ambiguity would propagate into every adherence figure.
  constraint waking_window_valid check (waking_start < waking_end)
);

comment on table public.profiles is
  'One row per user, holding the settings that parameterise every metric in the app.';

alter table public.profiles enable row level security;

create policy "profiles are readable by owner"
  on public.profiles for select
  using ((select auth.uid()) = id);

create policy "profiles are updatable by owner"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- categories

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,

  name text not null check (length(trim(name)) between 1 and 60),
  color public.notion_color not null default 'gray',

  parent_id uuid references public.categories on delete set null,

  -- Distinguishes intentional investment from maintenance and leisure. Used by
  -- the allocation metric; it is not a moral judgement and sleep is not "unproductive".
  is_productive boolean not null default true,

  sort_order integer not null default 0,

  -- Categories are archived, never deleted, because historical time slots
  -- reference them and deleting would silently rewrite past adherence numbers.
  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint category_not_own_parent check (id <> parent_id),
  unique (user_id, name)
);

comment on table public.categories is
  'Time categories. Archived rather than deleted so historical metrics stay reproducible.';

create index categories_user_idx on public.categories (user_id) where archived_at is null;
create index categories_parent_idx on public.categories (parent_id);

alter table public.categories enable row level security;

create policy "categories are readable by owner"
  on public.categories for select
  using ((select auth.uid()) = user_id);

create policy "categories are insertable by owner"
  on public.categories for insert
  with check ((select auth.uid()) = user_id);

create policy "categories are updatable by owner"
  on public.categories for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "categories are deletable by owner"
  on public.categories for delete
  using ((select auth.uid()) = user_id);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- bootstrap

-- Creates the profile and a starter category set the moment a user signs up, so
-- the app never has to handle a half-initialised account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);

  insert into public.categories (user_id, name, color, is_productive, sort_order)
  values
    (new.id, 'Deep Work',  'blue',   true,  10),
    (new.id, 'Admin',      'gray',   true,  20),
    (new.id, 'Learning',   'purple', true,  30),
    (new.id, 'Gym',        'green',  true,  40),
    (new.id, 'Health',     'green',  true,  50),
    (new.id, 'Sleep',      'gray',   true,  60),
    (new.id, 'Meals',      'orange', true,  70),
    (new.id, 'Commute',    'brown',  false, 80),
    (new.id, 'Leisure',    'yellow', false, 90),
    (new.id, 'Distraction','red',    false, 100);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
