-- Synapse — Phase 2: the time ledger
--
-- A day is 96 slots of 15 minutes. Slots are stored SPARSELY — only the ones
-- actually filled get a row — and read DENSELY, through get_day_grid(), which
-- projects the stored rows onto a full local day so the UI never has to reason
-- about gaps. "Find the unaccounted time" becomes a scan rather than a proof of
-- absence.
--
-- Two kinds of slot coexist for the same instant:
--
--   planned   written the night before
--   actual    reconciled at day close
--
-- Both are kept. Overwriting the plan with what happened would destroy the only
-- number that measures how well the user predicts themselves — see planning_bias
-- below and docs/DECISIONS.md 007 and 016.
--
-- This migration also replaces the body of goal_own_hours(), which is the entire
-- integration with the Phase 1 goal graph. goal_effort_shares and
-- goal_effort_rollup were written for real in Phase 1 — path-wise weight
-- accumulation, unbounded depth, diamond-correct — and are untouched here.
--
-- Migrations are append-only. Never edit a file that has been applied.

-- ---------------------------------------------------------------- enum

create type public.slot_kind as enum ('planned', 'actual');

comment on type public.slot_kind is
  'planned is what was committed to in advance; actual is what happened. Their divergence is the planning-bias metric, so both are stored for the same instant.';

-- ---------------------------------------------------------------- time_slots

create table public.time_slots (
  user_id uuid not null references auth.users on delete cascade,

  -- UTC, always. The local day exists only for display and for projecting the
  -- waking window; see the alignment constraint below.
  slot_start timestamptz not null,
  kind public.slot_kind not null,

  goal_id uuid,
  category_id uuid references public.categories on delete set null,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One planned and one actual slot per instant, never two of a kind.
  primary key (user_id, slot_start, kind),

  -- 900 seconds. A database constraint rather than a convention: every metric
  -- downstream counts rows and multiplies by 0.25, so a slot that is not a
  -- quarter hour would silently corrupt every hour figure in the system.
  constraint slot_aligned check (
    extract(epoch from slot_start)::bigint % 900 = 0
  ),

  -- The same composite-key trick as Phase 1: this proves in the schema that the
  -- goal belongs to the slot's owner. RLS alone would not catch a user passing
  -- their own user_id alongside someone else's goal_id.
  --
  -- SET NULL names goal_id explicitly (PG 15+). Bare `on delete set null` on a
  -- composite foreign key nulls EVERY referencing column, user_id included, and
  -- that column is NOT NULL — so the unqualified form would turn deleting a goal
  -- into a constraint violation rather than a detachment.
  --
  -- Detachment, not cascade, is the point: deleting a goal must not delete the
  -- record that the time was spent. The hours stay; only their attribution goes.
  constraint time_slots_goal_fkey
    foreign key (goal_id, user_id) references public.goals (id, user_id)
    on delete set null (goal_id)
);

comment on table public.time_slots is
  'The 15-minute ledger. Sparse storage, dense reads via get_day_grid(). Rows survive the deletion of the goal they were attributed to.';

comment on column public.time_slots.slot_start is
  'UTC instant, aligned to a 900-second boundary. Local time is a projection, never storage.';

/*
 * No index on (user_id, slot_start): the primary key is (user_id, slot_start,
 * kind), so its index already serves every range scan over that prefix. A second
 * index would add write amplification on the hottest table in the app and answer
 * no query the first one cannot.
 */
create index time_slots_goal_idx
  on public.time_slots (goal_id) where goal_id is not null;

alter table public.time_slots enable row level security;

create policy "time slots are readable by owner"
  on public.time_slots for select
  using ((select auth.uid()) = user_id);

create policy "time slots are insertable by owner"
  on public.time_slots for insert
  with check ((select auth.uid()) = user_id);

create policy "time slots are updatable by owner"
  on public.time_slots for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "time slots are deletable by owner"
  on public.time_slots for delete
  using ((select auth.uid()) = user_id);

create trigger time_slots_set_updated_at
  before update on public.time_slots
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- goal_own_hours

/*
 * The leaf term of the effort rollup, and the single seam this phase replaces.
 *
 * Only actual slots count. Planned time is a statement of intent and adding it
 * to an effort total would let a user roll up hours they never spent.
 *
 * Nothing above this changes. If the rollup looks wrong after this migration the
 * bug is in time_slots or in this function, not in the Phase 1 recursion.
 */
create or replace function public.goal_own_hours(p_goal_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(count(*) * 0.25, 0)   -- 15 minutes per slot
  from public.time_slots
  where goal_id = p_goal_id and kind = 'actual';
$$;

comment on function public.goal_own_hours is
  'Hours logged directly against a goal: actual slots only, a quarter hour each. The leaf term of goal_effort_rollup.';

-- ---------------------------------------------------------------- day grid

/*
 * The dense read. One row per slot of the user's local day, with the planned and
 * actual assignments joined side by side and the waking window already evaluated.
 *
 * ON THE ROW COUNT. This returns 96 rows for any day without a DST transition,
 * and 92 or 100 across one, because the local day genuinely is 23 or 25 hours
 * long. Always emitting 96 from local midnight would silently drop or duplicate
 * an hour, which is exactly the kind of quiet wrongness this project exists to
 * avoid. Asia/Kolkata has no DST, so the default profile always sees 96.
 *
 * Alignment survives a transition: every real DST offset is a whole number of
 * quarter hours, and the series steps by an absolute 15 minutes, so slot_start
 * stays 900-second aligned on both sides of the boundary.
 *
 * p_user_id exists for the Phase 5 nudge engine, which reads these metrics from
 * an Edge Function rather than a browser session. It grants nothing: RLS still
 * filters profiles and time_slots, so passing another user's id under a normal
 * session returns no rows at all.
 */
create or replace function public.get_day_grid(
  p_date date,
  p_user_id uuid default null
)
returns table (
  slot_index          int,
  slot_start          timestamptz,
  local_time          time,
  in_waking_window    boolean,
  has_planned         boolean,
  planned_goal_id     uuid,
  planned_category_id uuid,
  planned_note        text,
  has_actual          boolean,
  actual_goal_id      uuid,
  actual_category_id  uuid,
  actual_note         text
)
language sql
stable
as $$
  with bounds as (
    select p.id as user_id,
           p.timezone,
           p.waking_start,
           p.waking_end,
           (p_date::timestamp)       at time zone p.timezone as day_start,
           ((p_date + 1)::timestamp) at time zone p.timezone as day_end
    from public.profiles p
    where p.id = coalesce(p_user_id, (select auth.uid()))
  ),
  grid as (
    select b.user_id,
           b.timezone,
           b.waking_start,
           b.waking_end,
           s.at,
           (row_number() over (order by s.at) - 1)::int as slot_index
    from bounds b
    cross join lateral generate_series(
      b.day_start,
      b.day_end - interval '15 minutes',
      interval '15 minutes'
    ) as s(at)
  )
  select g.slot_index,
         g.at,
         (g.at at time zone g.timezone)::time,
         (g.at at time zone g.timezone)::time >= g.waking_start
           and (g.at at time zone g.timezone)::time < g.waking_end,
         pl.user_id is not null,
         pl.goal_id, pl.category_id, pl.note,
         ac.user_id is not null,
         ac.goal_id, ac.category_id, ac.note
  from grid g
  left join public.time_slots pl
    on pl.user_id = g.user_id and pl.slot_start = g.at and pl.kind = 'planned'
  left join public.time_slots ac
    on ac.user_id = g.user_id and ac.slot_start = g.at and ac.kind = 'actual'
  order by g.at;
$$;

comment on function public.get_day_grid is
  'A dense day: every slot of the user''s local day with both kinds joined side by side. 96 rows except across a DST transition, where the day really is 92 or 100 slots long.';

-- ---------------------------------------------------------------- adherence

/*
 * Coverage — how much of the waking window is accounted for.
 *
 * The waking window is the denominator, so time outside it is excluded from BOTH
 * sides rather than counted as a gap. Sleeping through the night is not a
 * tracking failure, and a metric that said otherwise would be ignored within a
 * week.
 *
 * A slot counts as logged when an actual row exists for it, whether or not it
 * names a goal or a category — "something happened here and I do not want to
 * classify it" is still an account of the time.
 */
create or replace function public.day_coverage(
  p_date date,
  p_user_id uuid default null
)
returns table (logged int, expected int, coverage numeric)
language sql
stable
as $$
  select count(*) filter (where g.has_actual)::int,
         count(*)::int,
         case
           when count(*) = 0 then null
           else count(*) filter (where g.has_actual)::numeric / count(*)
         end
  from public.get_day_grid(p_date, p_user_id) g
  where g.in_waking_window;
$$;

comment on function public.day_coverage is
  'Logged slots over slots in the waking window. Null when the window is empty — a day with no denominator has no coverage, not zero coverage.';

/*
 * Fidelity — how much of the plan was actually followed.
 *
 * A planned slot is honoured when the actual at the same instant matches what
 * was committed to at the granularity it was committed to:
 *
 *   planned a goal      -> the same goal was worked
 *   planned a category  -> the time went to that category
 *   planned neither     -> any logged actual counts
 *
 * Judging a category-level plan against the goal would mark a kept commitment as
 * broken; judging a goal-level plan against the category would mark a broken one
 * as kept. See docs/DECISIONS.md 017.
 *
 * WATCH THE DENOMINATOR. A day with no plan has a fidelity of nothing — not
 * 100%, which would reward never planning, and not 0%, which would punish it.
 * Null, and the UI says so.
 *
 * Unlike coverage this is not restricted to the waking window: a commitment made
 * for 06:00 is still a commitment.
 */
create or replace function public.day_fidelity(
  p_date date,
  p_user_id uuid default null
)
returns table (planned int, honoured int, fidelity numeric)
language sql
stable
as $$
  with judged as (
    select case
             when g.planned_goal_id is not null
               then g.actual_goal_id is not distinct from g.planned_goal_id
             when g.planned_category_id is not null
               then g.actual_category_id is not distinct from g.planned_category_id
             else g.has_actual
           end as honoured
    from public.get_day_grid(p_date, p_user_id) g
    where g.has_planned
  )
  select count(*)::int,
         count(*) filter (where judged.honoured)::int,
         case
           when count(*) = 0 then null
           else count(*) filter (where judged.honoured)::numeric / count(*)
         end
  from judged;
$$;

comment on function public.day_fidelity is
  'Planned slots that were honoured, over planned slots. Null when nothing was planned: a day with no plan has a fidelity of nothing, not of 100%.';

/*
 * Planning bias — planned hours against actual hours, per category, over a range.
 *
 * This is the number that only exists because both kinds of slot are kept. It
 * answers "which categories do I consistently under-budget?", which is a
 * different and more useful question than "did I follow the plan today".
 *
 * The uncategorised row (category_id null) is deliberately included rather than
 * dropped: unclassified time is usually where the bias hides.
 */
create or replace function public.planning_bias(
  p_from date,
  p_to date,
  p_user_id uuid default null
)
returns table (
  category_id   uuid,
  category_name text,
  planned_hours numeric,
  actual_hours  numeric,
  bias_hours    numeric,
  bias_ratio    numeric
)
language sql
stable
as $$
  with bounds as (
    select p.id as user_id,
           (p_from::timestamp)     at time zone p.timezone as from_at,
           ((p_to + 1)::timestamp) at time zone p.timezone as to_at
    from public.profiles p
    where p.id = coalesce(p_user_id, (select auth.uid()))
  ),
  agg as (
    select t.category_id,
           count(*) filter (where t.kind = 'planned') * 0.25 as planned_hours,
           count(*) filter (where t.kind = 'actual')  * 0.25 as actual_hours
    from bounds b
    join public.time_slots t
      on t.user_id = b.user_id
     and t.slot_start >= b.from_at
     and t.slot_start <  b.to_at
    group by t.category_id
  )
  select agg.category_id,
         c.name,
         agg.planned_hours,
         agg.actual_hours,
         agg.actual_hours - agg.planned_hours,
         case
           when agg.planned_hours = 0 then null
           else agg.actual_hours / agg.planned_hours
         end
  from agg
  left join public.categories c on c.id = agg.category_id
  order by agg.planned_hours desc, c.name nulls last;
$$;

comment on function public.planning_bias is
  'Planned versus actual hours per category over a date range. Null ratio where nothing was planned — you cannot be biased about a budget you never set.';
