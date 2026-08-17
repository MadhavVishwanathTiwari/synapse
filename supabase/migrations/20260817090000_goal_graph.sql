-- Synapse — Phase 1: the goal graph
--
-- Goals form a directed acyclic graph across six horizons (day → decade). One
-- table covers all of them; a "task" is simply horizon = 'day'. Edges are typed:
--
--   contributes_to  vertical, carries a weight and an optional unit conversion
--   depends_on      blocking, any horizon
--   relates_to      navigation only, no maths
--
-- Two properties make the numbers above this layer trustworthy, and both are
-- enforced here rather than in application code:
--
--   * the contributes_to graph is acyclic, so the effort rollup terminates
--   * each goal's outgoing contribution weights total ≤ 1.0, so a goal serving
--     two parents splits its effort between them instead of being counted twice
--
-- Effort in hours rolls up the whole chain exactly. Outcome quantities roll up
-- only one or two hops and only across edges whose units are reconcilable —
-- see docs/DECISIONS.md 004 and 005. Refusing to sum is a feature here: a
-- number carried across an undeclared unit boundary would be fabricated.
--
-- Migrations are append-only. Never edit a file that has been applied.

-- ---------------------------------------------------------------- enums

create type public.goal_horizon as enum
  ('day', 'week', 'month', 'quarter', 'year', 'decade');

create type public.goal_status as enum
  ('active', 'done', 'abandoned', 'blocked');

create type public.goal_link_type as enum
  ('contributes_to', 'depends_on', 'relates_to');

-- ---------------------------------------------------------------- goals

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,

  horizon public.goal_horizon not null,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  color public.notion_color not null default 'gray',

  -- 'emails', 'replies', 'clients', 'INR'. Free text on purpose: the unit
  -- vocabulary is the user's, and the system only ever compares units for
  -- equality or crosses them with a declared conversion factor.
  metric_unit text,
  target_value numeric,

  start_date date not null,
  due_date date not null,

  status public.goal_status not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint goal_dates_valid check (start_date <= due_date),

  -- A target without a unit is unmeasurable; a unit without a target is noise.
  constraint goal_metric_paired check (
    (metric_unit is null) = (target_value is null)
  ),

  -- Redundant against the primary key, but it is what lets the three dependent
  -- tables carry a composite foreign key and so prove, in the schema, that both
  -- ends of every link and every progress row belong to the same user. Without
  -- it a user could reference another user's goal id while passing their own
  -- user_id, which RLS alone would not catch.
  unique (id, user_id)
);

comment on table public.goals is
  'Every goal at every horizon. A task is a goal with horizon = ''day''.';

create index goals_user_horizon_idx
  on public.goals (user_id, horizon, status);

create index goals_user_due_idx
  on public.goals (user_id, due_date) where status = 'active';

alter table public.goals enable row level security;

create policy "goals are readable by owner"
  on public.goals for select
  using ((select auth.uid()) = user_id);

create policy "goals are insertable by owner"
  on public.goals for insert
  with check ((select auth.uid()) = user_id);

create policy "goals are updatable by owner"
  on public.goals for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "goals are deletable by owner"
  on public.goals for delete
  using ((select auth.uid()) = user_id);

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- goal_links

create table public.goal_links (
  parent_id uuid not null,
  child_id  uuid not null,
  user_id   uuid not null references auth.users on delete cascade,

  link_type public.goal_link_type not null,

  -- The fraction of the CHILD's effort attributed to this parent. Summed across
  -- a child's outgoing contributes_to edges it must not exceed 1.0.
  contribution_weight numeric not null default 1.0
    check (contribution_weight > 0 and contribution_weight <= 1.0),

  -- Child units → parent units. Null means undeclared, which is not the same as
  -- 1.0: it means the outcome rollup must refuse to cross this edge.
  conversion_factor numeric check (conversion_factor > 0),
  conversion_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (parent_id, child_id, link_type),

  constraint no_self_link check (parent_id <> child_id),

  -- Only vertical edges carry maths. A conversion factor on a depends_on edge
  -- would be silently ignored, which is worse than being rejected.
  constraint conversion_only_on_contribution check (
    link_type = 'contributes_to' or conversion_factor is null
  ),

  -- Both endpoints must belong to the row's owner. See the note on goals.
  constraint goal_links_parent_fkey
    foreign key (parent_id, user_id) references public.goals (id, user_id)
    on delete cascade,
  constraint goal_links_child_fkey
    foreign key (child_id, user_id) references public.goals (id, user_id)
    on delete cascade
);

comment on table public.goal_links is
  'Typed edges between goals. For depends_on, parent_id is the prerequisite and child_id is the goal it blocks, so parent always means "upstream".';

create index goal_links_child_idx  on public.goal_links (child_id, link_type);
create index goal_links_parent_idx on public.goal_links (parent_id, link_type);

alter table public.goal_links enable row level security;

create policy "goal links are readable by owner"
  on public.goal_links for select
  using ((select auth.uid()) = user_id);

create policy "goal links are insertable by owner"
  on public.goal_links for insert
  with check ((select auth.uid()) = user_id);

create policy "goal links are updatable by owner"
  on public.goal_links for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "goal links are deletable by owner"
  on public.goal_links for delete
  using ((select auth.uid()) = user_id);

create trigger goal_links_set_updated_at
  before update on public.goal_links
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- goal_revisions

create table public.goal_revisions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null,
  user_id uuid not null references auth.users on delete cascade,

  field text not null check (field in ('target_value', 'due_date', 'status')),
  old_value text,
  new_value text,
  reason text,

  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint goal_revisions_goal_fkey
    foreign key (goal_id, user_id) references public.goals (id, user_id)
    on delete cascade
);

comment on table public.goal_revisions is
  'Append-only log of target, deadline and status changes. Pace for a past date is computed against the revision in effect then, which is what stops the system becoming a machine for flattering the user.';

create index goal_revisions_goal_idx
  on public.goal_revisions (goal_id, changed_at desc);

alter table public.goal_revisions enable row level security;

-- Deliberately SELECT only. Rows are written exclusively by the security definer
-- trigger below, so the log cannot be edited or backdated through the API — the
-- append-only property is enforced by the absence of policies, not by convention.
create policy "goal revisions are readable by owner"
  on public.goal_revisions for select
  using ((select auth.uid()) = user_id);

create trigger goal_revisions_set_updated_at
  before update on public.goal_revisions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- goal_progress

create table public.goal_progress (
  goal_id uuid not null,
  user_id uuid not null references auth.users on delete cascade,

  date date not null,

  -- The amount achieved ON this date, not the running total. Cumulative
  -- progress is a sum over rows; the daily figure is what the EWMA smooths.
  -- Negative values are legal — net worth can fall.
  value numeric not null,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (goal_id, date),

  constraint goal_progress_goal_fkey
    foreign key (goal_id, user_id) references public.goals (id, user_id)
    on delete cascade
);

comment on column public.goal_progress.value is
  'Increment achieved on this date, not a running total.';

create index goal_progress_goal_date_idx
  on public.goal_progress (goal_id, date desc);

alter table public.goal_progress enable row level security;

create policy "goal progress is readable by owner"
  on public.goal_progress for select
  using ((select auth.uid()) = user_id);

create policy "goal progress is insertable by owner"
  on public.goal_progress for insert
  with check ((select auth.uid()) = user_id);

create policy "goal progress is updatable by owner"
  on public.goal_progress for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "goal progress is deletable by owner"
  on public.goal_progress for delete
  using ((select auth.uid()) = user_id);

create trigger goal_progress_set_updated_at
  before update on public.goal_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- acyclicity

/*
 * A cycle in contributes_to makes the effort rollup non-terminating, and a cycle
 * in depends_on describes a schedule that cannot be satisfied. Both are rejected.
 *
 * The check is per link_type. Effort traverses only contributes_to and the
 * critical path traverses only depends_on, so a loop that alternates between the
 * two is harmless to both recursions; rejecting it would refuse legitimate
 * graphs (a goal can reasonably block something that also feeds it). relates_to
 * carries no maths and may cycle freely.
 */
create or replace function public.goal_links_no_cycle()
returns trigger
language plpgsql
as $$
begin
  if new.link_type = 'relates_to' then
    return new;
  end if;

  -- Walk up from the proposed parent. If the proposed child is already one of
  -- its ancestors, this edge closes a loop.
  if exists (
    with recursive ancestors (id, depth) as (
      select new.parent_id, 0
      union all
      select l.parent_id, a.depth + 1
      from ancestors a
      join public.goal_links l
        on l.child_id = a.id
       and l.link_type = new.link_type
      where a.depth < 64
    )
    select 1 from ancestors where id = new.child_id
  ) then
    raise exception
      using errcode = 'SY001',
            message = 'SY001: this link would create a cycle',
            detail  = format('%s already traces back to %s via %s edges',
                             new.parent_id, new.child_id, new.link_type);
  end if;

  return new;
end;
$$;

comment on function public.goal_links_no_cycle is
  'Rejects edges that would close a loop within a single link_type. Correctness requirement, not a nicety: the effort rollup would not terminate.';

create trigger goal_links_no_cycle
  before insert or update on public.goal_links
  for each row execute function public.goal_links_no_cycle();

-- ---------------------------------------------------------------- weight budget

/*
 * Without this, a task linked to two parents contributes fully to each and every
 * ancestor total silently inflates. The constraint is what turns a multi-parent
 * link into a split of effort rather than a duplication of it.
 *
 * contribution_weight is numeric rather than double precision precisely so that
 * 0.7 + 0.3 is exactly 1.0 here and no epsilon fudge is needed.
 */
create or replace function public.goal_links_weight_budget()
returns trigger
language plpgsql
as $$
declare
  v_total numeric;
begin
  if new.link_type <> 'contributes_to' then
    return null;
  end if;

  -- Serialise concurrent edits to the same child, otherwise two transactions can
  -- each read 0.6, each add 0.5, and both commit.
  perform pg_advisory_xact_lock(hashtextextended(new.child_id::text, 0));

  select coalesce(sum(contribution_weight), 0)
    into v_total
    from public.goal_links
   where child_id = new.child_id
     and link_type = 'contributes_to';

  if v_total > 1.0 then
    raise exception
      using errcode = 'SY002',
            message = format(
              'SY002: contribution weights for this goal total %s, which exceeds 1.0',
              v_total);
  end if;

  return null;
end;
$$;

comment on function public.goal_links_weight_budget is
  'Keeps each goal''s outgoing contributes_to weights within 1.0 — the single constraint keeping ancestor totals honest.';

-- A constraint trigger so a rebalancing transaction can SET CONSTRAINTS ALL
-- DEFERRED and swap two weights without tripping on the intermediate state.
create constraint trigger goal_links_weight_budget
  after insert or update on public.goal_links
  deferrable initially immediate
  for each row execute function public.goal_links_weight_budget();

-- ---------------------------------------------------------------- revision log

/*
 * Editing a target or a deadline is a real event and is recorded as one.
 *
 * The reason cannot be passed to a trigger through the row, so update_goal_targets()
 * puts it in a transaction-local GUC that this function reads. The trigger fires
 * on every update regardless of how it was made, so the log stays complete even
 * for a direct write — those simply carry a null reason.
 */
create or replace function public.goals_log_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(current_setting('synapse.revision_reason', true), '');
begin
  if new.target_value is distinct from old.target_value then
    insert into public.goal_revisions (goal_id, user_id, field, old_value, new_value, reason)
    values (new.id, new.user_id, 'target_value',
            old.target_value::text, new.target_value::text, v_reason);
  end if;

  if new.due_date is distinct from old.due_date then
    insert into public.goal_revisions (goal_id, user_id, field, old_value, new_value, reason)
    values (new.id, new.user_id, 'due_date',
            old.due_date::text, new.due_date::text, v_reason);
  end if;

  if new.status is distinct from old.status then
    insert into public.goal_revisions (goal_id, user_id, field, old_value, new_value, reason)
    values (new.id, new.user_id, 'status',
            old.status::text, new.status::text, v_reason);
  end if;

  return null;
end;
$$;

create trigger goals_log_revision
  after update on public.goals
  for each row execute function public.goals_log_revision();

create or replace function public.update_goal_targets(
  p_goal_id uuid,
  p_metric_unit text,
  p_target_value numeric,
  p_due_date date,
  p_status public.goal_status,
  p_reason text default null
)
returns public.goals
language plpgsql
as $$
declare
  v_row public.goals;
begin
  -- Transaction-local: it must not leak into the next statement on this
  -- connection, which is pooled and shared.
  perform set_config('synapse.revision_reason', coalesce(p_reason, ''), true);

  update public.goals
     set metric_unit  = p_metric_unit,
         target_value = p_target_value,
         due_date     = p_due_date,
         status       = p_status
   where id = p_goal_id
  returning * into v_row;

  if not found then
    raise exception
      using errcode = 'SY003',
            message = 'SY003: goal not found';
  end if;

  perform set_config('synapse.revision_reason', '', true);

  return v_row;
end;
$$;

comment on function public.update_goal_targets is
  'The only write path for target_value, due_date and status. Security invoker, so RLS still applies — this exists to attach a reason to the revision, not to escalate privilege.';

-- ---------------------------------------------------------------- effort rollup

/*
 * The leaf term of the effort rollup, and the single seam Phase 2 replaces.
 *
 * Phase 1 has no time_slots table, so every goal's own logged time is zero. When
 * the ledger lands this body becomes a sum of slot durations for the goal and
 * nothing else in the recursion changes.
 */
create or replace function public.goal_own_hours(p_goal_id uuid)
returns numeric
language sql
stable
as $$
  select 0::numeric;
$$;

comment on function public.goal_own_hours is
  'Hours logged directly against a goal. Returns 0 until Phase 2 supplies time_slots; the recursion above it is already real.';

/*
 * Every goal reachable downward through contributes_to, with the fraction of its
 * effort that reaches p_goal_id.
 *
 * The recursion emits one row per PATH, not per goal, and multiplies weights
 * along each path. That is what makes a diamond correct: with A→B at 0.5, A→C at
 * 0.5 and both B and C feeding D, A is reached twice from D, once at 0.5 and once
 * at 0.5, totalling 1.0 — counted exactly once. Deduplicating visited nodes, the
 * intuitive alternative, would keep one arm and report half of A's effort.
 */
create or replace function public.goal_effort_shares(p_goal_id uuid)
returns table (goal_id uuid, share numeric)
language sql
stable
as $$
  with recursive descent (goal_id, share, depth) as (
    select p_goal_id, 1.0::numeric, 0
    union all
    select l.child_id,
           d.share * l.contribution_weight,
           d.depth + 1
    from descent d
    join public.goal_links l
      on l.parent_id = d.goal_id
     and l.link_type = 'contributes_to'
    -- Belt and braces: the acyclicity trigger already guarantees termination.
    where d.depth < 32
  )
  select descent.goal_id, sum(descent.share)
  from descent
  group by descent.goal_id;
$$;

create or replace function public.goal_effort_rollup(p_goal_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(public.goal_own_hours(s.goal_id) * s.share), 0)
  from public.goal_effort_shares(p_goal_id) s;
$$;

comment on function public.goal_effort_rollup is
  'Own logged hours plus each descendant''s hours times its accumulated contribution share. Unbounded depth, exact across diamonds.';

-- ---------------------------------------------------------------- outcome rollup

/*
 * Outcome quantities, unlike effort, are only meaningful across a hop or two and
 * only where the units reconcile — see docs/DECISIONS.md 004.
 *
 * This function returns what it could sum AND what it refused to, because a
 * single number here would be indistinguishable from a complete one. Refusing
 * loudly is the entire contract.
 */
create or replace function public.goal_outcome_rollup(
  p_goal_id uuid,
  p_max_depth int default 2
)
returns table (value numeric, is_complete boolean, unsummed jsonb)
language sql
stable
as $$
  with recursive walk (goal_id, unit, factor, depth, blocked, reason) as (
    select g.id, g.metric_unit, 1.0::numeric, 0, false, null::text
    from public.goals g
    where g.id = p_goal_id

    union all

    select c.id,
           c.metric_unit,
           w.factor * l.contribution_weight *
             case
               when c.metric_unit is not distinct from w.unit then 1.0
               else l.conversion_factor
             end,
           w.depth + 1,
           c.metric_unit is null
             or (c.metric_unit is distinct from w.unit and l.conversion_factor is null),
           case
             when c.metric_unit is null then 'child_unmeasured'
             when c.metric_unit is distinct from w.unit and l.conversion_factor is null
               then 'unit_mismatch'
           end
    from walk w
    join public.goal_links l
      on l.parent_id = w.goal_id
     and l.link_type = 'contributes_to'
    join public.goals c on c.id = l.child_id
    where w.depth < p_max_depth
      -- A refused edge is reported but never expanded: everything beyond it is
      -- unreachable by definition, not merely unsummed.
      and not w.blocked
  ),
  summed as (
    select coalesce(sum(
             coalesce((select sum(p.value)
                       from public.goal_progress p
                       where p.goal_id = w.goal_id), 0) * w.factor
           ), 0) as total
    from walk w
    where w.depth > 0 and not w.blocked
  ),
  refused as (
    select jsonb_agg(jsonb_build_object(
             'goal_id', x.goal_id, 'title', x.title, 'reason', x.reason
           ) order by x.title) as items
    from (
      select w.goal_id, g.title, w.reason
      from walk w
      join public.goals g on g.id = w.goal_id
      where w.blocked

      union all

      -- Reached the depth limit with children still below: not summed either,
      -- and for a reason the caller needs to be able to distinguish.
      select w.goal_id, g.title, 'depth_limit'
      from walk w
      join public.goals g on g.id = w.goal_id
      where w.depth = p_max_depth
        and not w.blocked
        and exists (
          select 1 from public.goal_links l
          where l.parent_id = w.goal_id and l.link_type = 'contributes_to'
        )
    ) x
  )
  select summed.total,
         coalesce(refused.items, '[]'::jsonb) = '[]'::jsonb,
         coalesce(refused.items, '[]'::jsonb)
  from summed, refused;
$$;

comment on function public.goal_outcome_rollup is
  'Sums child progress across contributes_to edges, applying declared conversions and contribution weights. Never crosses an undeclared unit boundary; reports every subtree it declined to sum.';

-- ---------------------------------------------------------------- pace

/*
 * Pace, correct for any historical date.
 *
 * Target and deadline come from the revision in effect at p_as_of, never from the
 * goals row as it stands today. Raising a decade target must not retroactively
 * make last March look like a worse month than it was.
 */
create or replace function public.goal_pace(p_goal_id uuid, p_as_of date)
returns table (
  target_value     numeric,
  due_date         date,
  days_remaining   int,
  progress_to_date numeric,
  remaining        numeric,
  required_rate    numeric,
  achieved_rate    numeric,
  pace_ratio       numeric,
  status           text
)
language plpgsql
stable
as $$
declare
  v_goal      public.goals;
  v_tz        text;
  v_half_life int;
  v_alpha     numeric;
  v_cutoff    timestamptz;
  v_txt       text;
  v_target    numeric;
  v_due       date;
  v_progress  numeric;
  v_remaining numeric;
  v_days      int;
  v_required  numeric;
  v_achieved  numeric;
  v_ratio     numeric;
  v_status    text;
  v_has_rows  boolean;
  v_ewma      numeric := null;
  v_row       record;
begin
  select * into v_goal from public.goals g where g.id = p_goal_id;
  if not found then
    return;
  end if;

  select p.timezone, p.ewma_half_life_days
    into v_tz, v_half_life
    from public.profiles p
   where p.id = v_goal.user_id;

  v_tz        := coalesce(v_tz, 'UTC');
  v_half_life := coalesce(v_half_life, 7);

  -- A revision made during p_as_of counts as in effect that day, so the boundary
  -- is the end of the user's local day.
  v_cutoff := ((p_as_of + 1)::timestamp) at time zone v_tz;

  /*
   * The earliest revision AFTER the cutoff holds, in its old_value, the value
   * that was in effect at p_as_of. If there is none, the current row still is.
   *
   * `if found` rather than coalesce is essential: old_value is legitimately NULL
   * when a target is set for the first time, and coalescing would leak today's
   * target backwards into a period that had none.
   */
  select r.old_value into v_txt
    from public.goal_revisions r
   where r.goal_id = p_goal_id
     and r.field = 'target_value'
     and r.changed_at > v_cutoff
   order by r.changed_at asc
   limit 1;

  if found then
    v_target := v_txt::numeric;
  else
    v_target := v_goal.target_value;
  end if;

  select r.old_value into v_txt
    from public.goal_revisions r
   where r.goal_id = p_goal_id
     and r.field = 'due_date'
     and r.changed_at > v_cutoff
   order by r.changed_at asc
   limit 1;

  if found then
    v_due := v_txt::date;
  else
    v_due := v_goal.due_date;
  end if;

  select coalesce(sum(p.value), 0), count(*) > 0
    into v_progress, v_has_rows
    from public.goal_progress p
   where p.goal_id = p_goal_id
     and p.date <= p_as_of;

  v_days := v_due - p_as_of;

  -- EWMA over a densified daily series. The gaps must be real zeros: a goal
  -- touched once a fortnight has a low rate, not a high one with missing days.
  if v_has_rows then
    v_alpha := 1 - power(2.0, -1.0 / v_half_life);

    for v_row in
      select coalesce(p.value, 0) as v
        from generate_series(v_goal.start_date, p_as_of, interval '1 day') d
        left join public.goal_progress p
          on p.goal_id = p_goal_id and p.date = d::date
       order by d
    loop
      if v_ewma is null then
        v_ewma := v_row.v;
      else
        v_ewma := v_alpha * v_row.v + (1 - v_alpha) * v_ewma;
      end if;
    end loop;
  end if;

  v_achieved := v_ewma;

  if v_target is null then
    v_remaining := null;
    v_status    := 'unmeasured';
  else
    v_remaining := v_target - v_progress;

    if v_remaining <= 0 then
      v_status := 'complete';
    elsif not v_has_rows then
      v_status := 'no_data';
    elsif v_days <= 0 then
      v_status := 'overdue';
    elsif v_achieved = 0 then
      v_status := 'stalled';
    end if;
  end if;

  -- Rates are only computed where they mean something. Everything else stays
  -- null so the UI cannot render a number that has no denominator.
  if v_target is not null and v_remaining > 0 and v_days > 0 then
    v_required := v_remaining / v_days;
  end if;

  if v_required is not null and v_achieved is not null and v_achieved <> 0 then
    v_ratio := v_required / v_achieved;
  end if;

  if v_status is null then
    v_status := case
                  when v_ratio > 1.05 then 'behind'
                  when v_ratio < 0.95 then 'ahead'
                  else 'on_track'
                end;
  end if;

  return query select
    v_target, v_due, v_days, v_progress, v_remaining,
    v_required, v_achieved, v_ratio, v_status;
end;
$$;

comment on function public.goal_pace is
  'Required versus achieved rate as of any date, evaluated against the target and deadline in effect on that date.';

-- ---------------------------------------------------------------- dependencies

create or replace function public.blocked_goals()
returns table (
  goal_id       uuid,
  title         text,
  horizon       public.goal_horizon,
  blocker_id    uuid,
  blocker_title text
)
language sql
stable
as $$
  select g.id, g.title, g.horizon, b.id, b.title
  from public.goals g
  join public.goal_links l on l.child_id = g.id and l.link_type = 'depends_on'
  join public.goals b on b.id = l.parent_id
  where b.status not in ('done', 'abandoned')
    and g.status not in ('done', 'abandoned');
$$;

comment on function public.blocked_goals is
  'Goals with at least one unfinished depends_on prerequisite. parent_id is the prerequisite.';

/*
 * The longest chain of prerequisites leading to a goal, with the point at which
 * the schedule stops being satisfiable: a prerequisite due after the goal that
 * depends on it is an impossible deadline, not a tight one.
 */
create or replace function public.critical_path(p_goal_id uuid)
returns table (
  depth            int,
  goal_id          uuid,
  title            text,
  due_date         date,
  deadline_broken  boolean
)
language sql
stable
as $$
  with recursive chain (depth, goal_id, path) as (
    select 0, g.id, array[g.id]
    from public.goals g
    where g.id = p_goal_id

    union all

    select c.depth + 1, p.id, c.path || p.id
    from chain c
    join public.goal_links l on l.child_id = c.goal_id and l.link_type = 'depends_on'
    join public.goals p on p.id = l.parent_id
    -- depends_on is acyclic by trigger; this also guards against a path
    -- revisiting a goal reachable by two different routes.
    where not p.id = any(c.path)
      and c.depth < 64
  ),
  longest as (
    select c.path from chain c order by c.depth desc, c.goal_id limit 1
  )
  select (u.ord - 1)::int,
         g.id,
         g.title,
         g.due_date,
         coalesce(g.due_date > lag(g.due_date) over (order by u.ord), false)
  from longest
  cross join unnest(longest.path) with ordinality as u(goal_id, ord)
  join public.goals g on g.id = u.goal_id
  order by u.ord;
$$;

-- ---------------------------------------------------------------- ancestry

/*
 * Every contributes_to edge above a goal, up to the longest horizon, with the
 * share of the goal's effort flowing along each hop and a flag marking hops the
 * outcome rollup would refuse to cross. This is the visualiser's single query.
 */
create or replace function public.goal_ancestry(p_goal_id uuid)
returns table (
  parent_id                      uuid,
  child_id                       uuid,
  contribution_weight            numeric,
  conversion_factor              numeric,
  conversion_note                text,
  depth                          int,
  share                          numeric,
  crosses_undeclared_conversion  boolean
)
language sql
stable
as $$
  with recursive up (
    parent_id, child_id, contribution_weight, conversion_factor,
    conversion_note, depth, share, child_unit, parent_unit
  ) as (
    select l.parent_id, l.child_id, l.contribution_weight, l.conversion_factor,
           l.conversion_note, 1, l.contribution_weight, c.metric_unit, p.metric_unit
    from public.goal_links l
    join public.goals c on c.id = l.child_id
    join public.goals p on p.id = l.parent_id
    where l.child_id = p_goal_id
      and l.link_type = 'contributes_to'

    union all

    select l.parent_id, l.child_id, l.contribution_weight, l.conversion_factor,
           l.conversion_note, u.depth + 1, u.share * l.contribution_weight,
           c.metric_unit, p.metric_unit
    from up u
    join public.goal_links l
      on l.child_id = u.parent_id
     and l.link_type = 'contributes_to'
    join public.goals c on c.id = l.child_id
    join public.goals p on p.id = l.parent_id
    where u.depth < 16
  )
  select up.parent_id, up.child_id, up.contribution_weight, up.conversion_factor,
         up.conversion_note, min(up.depth)::int, sum(up.share),
         bool_or(up.child_unit is distinct from up.parent_unit
                 and up.conversion_factor is null)
  from up
  group by up.parent_id, up.child_id, up.contribution_weight,
           up.conversion_factor, up.conversion_note;
$$;

-- ---------------------------------------------------------------- views

/*
 * security_invoker is not optional. Without it a view executes as its owner and
 * returns every user's rows while each underlying table policy remains perfectly
 * correct — the one mistake available here that silently defeats all of them.
 */
create view public.goal_overview with (security_invoker = on) as
  select g.*,
         coalesce(pr.total, 0) as progress_total,
         coalesce(pc.n, 0)     as parent_count,
         coalesce(cc.n, 0)     as child_count,
         exists (
           select 1
           from public.goal_links l
           join public.goals b on b.id = l.parent_id
           where l.child_id = g.id
             and l.link_type = 'depends_on'
             and b.status not in ('done', 'abandoned')
         ) as is_blocked
  from public.goals g
  left join lateral (
    select sum(p.value) as total
    from public.goal_progress p where p.goal_id = g.id
  ) pr on true
  left join lateral (
    select count(*) as n
    from public.goal_links l
    where l.child_id = g.id and l.link_type = 'contributes_to'
  ) pc on true
  left join lateral (
    select count(*) as n
    from public.goal_links l
    where l.parent_id = g.id and l.link_type = 'contributes_to'
  ) cc on true;

comment on view public.goal_overview is
  'Goals with progress totals and link counts, for list views.';

create view public.goal_weight_budget with (security_invoker = on) as
  select g.id as goal_id,
         g.user_id,
         coalesce(sum(l.contribution_weight), 0) as allocated,
         1.0 - coalesce(sum(l.contribution_weight), 0) as remaining
  from public.goals g
  left join public.goal_links l
    on l.child_id = g.id and l.link_type = 'contributes_to'
  group by g.id, g.user_id;

comment on view public.goal_weight_budget is
  'How much of each goal''s 1.0 contribution budget is already allocated to parents. Lets the link editor show an over-allocation before the trigger has to reject it.';
