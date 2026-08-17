-- Synapse — Phase 3: the metrics the dashboard reads
--
-- Almost nothing here is new modelling. Coverage, fidelity, pace and the two
-- rollups already exist and are already tested; this migration adds the third
-- adherence number, two range-shaped series, and one selection over pace — and
-- it adds them in SQL because hard rule 1 says every metric is defined once,
-- where the dashboard and the Phase 5 nudge engine both read the same one.
--
-- THE RECURRING THEME IS NULL. Every function below returns null where a metric
-- is undefined rather than zero:
--
--   share / productive_share   null when nothing was logged at all
--   fidelity (in the series)   null on a day with no plan
--   outcome_value              null on a day with no entry — not an entry of 0
--   cumulative_outcome         null until the first measurement in the range
--
-- Those nulls are the product. A zero and an absence look identical in a chart
-- and mean completely different things, and this is the phase where the
-- temptation to flatten one into the other is constant.
--
-- Every function is security invoker (the default) and takes an optional
-- p_user_id resolved through coalesce(p_user_id, auth.uid()). That argument
-- grants nothing: RLS still filters profiles, time_slots, goals and
-- goal_progress, so passing another user's id under a normal session returns no
-- rows at all. Phase 5 will call these from an Edge Function; the definitions
-- must not fork to let it.
--
-- Migrations are append-only. Never edit a file that has been applied.

-- ---------------------------------------------------------------- allocation

/*
 * Where the hours went, per category, over a range.
 *
 * The third of the three ADR 007 adherence numbers, and the only one Phase 2 did
 * not build. Actual slots only: allocation describes what happened, and planned
 * time is a statement of intent.
 *
 * IT IS NOT A SCORE. `categories.is_productive` marks sleep as productive on
 * purpose — it separates intentional investment from maintenance and leisure,
 * not good hours from bad ones. See docs/DECISIONS.md 019.
 *
 * Two things this deliberately does NOT do:
 *
 *   - It does not drop the uncategorised row. Unclassified time is usually where
 *     the interesting answer is hiding, and a report that silently omits it
 *     produces shares that do not sum to the day.
 *
 *   - It does not report is_productive as false for that row. There is no flag
 *     on unclassified time; "not classified" and "not productive" are different
 *     claims and collapsing them invents a judgement the data never carried.
 *
 * Unlike coverage this is not restricted to the waking window. Coverage asks
 * how much of the window is accounted for; allocation asks where the accounted
 * hours went, and an hour at 03:00 went somewhere too.
 */
create or replace function public.allocation(
  p_from date,
  p_to date,
  p_user_id uuid default null
)
returns table (
  category_id   uuid,
  category_name text,
  is_productive boolean,
  actual_hours  numeric,
  logged_hours  numeric,
  share         numeric
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
           count(*) * 0.25 as actual_hours   -- 15 minutes per slot
    from bounds b
    join public.time_slots t
      on t.user_id = b.user_id
     and t.kind = 'actual'
     and t.slot_start >= b.from_at
     and t.slot_start <  b.to_at
    group by t.category_id
  ),
  total as (
    select coalesce(sum(agg.actual_hours), 0) as logged from agg
  )
  -- logged_hours is repeated on every row on purpose: the denominator travels
  -- with the share so the UI can print "3.5 of 11 h" without doing arithmetic.
  select agg.category_id,
         c.name,
         c.is_productive,   -- null on the uncategorised row: the join misses
         agg.actual_hours,
         total.logged,
         case
           when total.logged = 0 then null
           else agg.actual_hours / total.logged
         end
  from agg
  cross join total
  left join public.categories c on c.id = agg.category_id
  order by agg.actual_hours desc, c.name nulls last;
$$;

comment on function public.allocation is
  'Actual hours per category over a range, with each category''s share of logged hours. Keeps the uncategorised row, and reports its is_productive as null rather than false — unclassified is not the same claim as unproductive.';

/*
 * The same metric at the total grain.
 *
 * A separate function rather than a total row inside allocation(), because a
 * row that is sometimes a category and sometimes a sum is a shape every caller
 * has to remember to filter. It exists at all because the dashboard is
 * forbidden from summing the per-category rows itself: hard rule 1, and Phase
 * 3's acceptance criterion that every figure trace to a SQL definition.
 *
 * Unclassified hours are reported as their own column and left in the
 * denominator. Excluding them would inflate productive_share by hiding the part
 * of the range the user never classified, which is exactly the part they should
 * be looking at.
 *
 * Always returns exactly one row, including for a range with nothing in it —
 * where productive_share is null, because a range with no hours has no
 * allocation rather than an allocation of zero.
 */
create or replace function public.allocation_summary(
  p_from date,
  p_to date,
  p_user_id uuid default null
)
returns table (
  productive_hours   numeric,
  unproductive_hours numeric,
  unclassified_hours numeric,
  logged_hours       numeric,
  productive_share   numeric
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
  slots as (
    select c.is_productive
    from bounds b
    join public.time_slots t
      on t.user_id = b.user_id
     and t.kind = 'actual'
     and t.slot_start >= b.from_at
     and t.slot_start <  b.to_at
    left join public.categories c on c.id = t.category_id
  )
  -- `is true` / `is false` rather than `= true` / `not`: the unclassified rows
  -- carry null here and must fall through to their own bucket, not into either
  -- of the other two.
  select count(*) filter (where slots.is_productive is true)  * 0.25,
         count(*) filter (where slots.is_productive is false) * 0.25,
         count(*) filter (where slots.is_productive is null)  * 0.25,
         count(*) * 0.25,
         case
           when count(*) = 0 then null
           else count(*) filter (where slots.is_productive is true)::numeric / count(*)
         end
  from slots;
$$;

comment on function public.allocation_summary is
  'Productive, unproductive and unclassified hours over a range, and productive hours as a share of all logged hours. Unclassified time stays in the denominator and is reported separately; null share when nothing was logged.';

-- ---------------------------------------------------------------- adherence series

/*
 * Coverage and fidelity per day across a range, in one query.
 *
 * This CALLS day_coverage and day_fidelity rather than reimplementing them, and
 * that is the entire point. A one-pass rewrite over time_slots would be faster
 * and would be a second definition of both metrics — which is the bug hard rule
 * 1 exists to prevent, and the one that eventually has the dashboard and the bot
 * disagreeing with no way to tell which is right.
 *
 * THE COST, so nobody "optimises" it into a divergence later: two get_day_grid
 * calls per day, each a 96-row generate_series plus two joins on the time_slots
 * primary key. Sixty of those for a 30-day range. On a single-user database that
 * is a few milliseconds, and it is the correct trade every time.
 *
 * EVERY DAY IN THE RANGE GETS A ROW, including days with no slots at all. A day
 * that was lived but never logged has a coverage of 0 — that is a real
 * measurement, not a gap. A day with no plan has a fidelity of null, and it
 * comes back as a null row rather than a missing one, because a dropped row and
 * a null row look identical in a chart and mean completely different things.
 */
create or replace function public.adherence_series(
  p_from date,
  p_to date,
  p_user_id uuid default null
)
returns table (
  day      date,
  logged   int,
  expected int,
  coverage numeric,
  planned  int,
  honoured int,
  fidelity numeric
)
language sql
stable
as $$
  select d::date,
         c.logged, c.expected, c.coverage,
         f.planned, f.honoured, f.fidelity
  from generate_series(p_from, p_to, interval '1 day') d
  cross join lateral public.day_coverage(d::date, p_user_id) c
  cross join lateral public.day_fidelity(d::date, p_user_id) f
  order by d;
$$;

comment on function public.adherence_series is
  'day_coverage and day_fidelity for every day of a range, one row each. Days with no slots are present with zero coverage; days with no plan are present with null fidelity. Calls both functions rather than restating them — see hard rule 1.';

-- ---------------------------------------------------------------- divergence

/*
 * Effort invested against outcome achieved, as two independent series on one
 * time axis. The ADR 004 view, and the reason the two rollups were kept apart.
 *
 * THEY ARE NEVER COMBINED. No blended completion percentage is computed here or
 * anywhere downstream, because the signal is precisely the gap between them:
 * effort climbing against a flat outcome means the strategy is wrong, and any
 * weighted average of the two destroys exactly that information.
 *
 * EFFORT reuses goal_effort_shares(), so the accumulated contribution weights —
 * unbounded depth, correct across diamonds — are the Phase 1 definition and not
 * a second copy of it. This function is the date-ranged analogue of
 * goal_effort_rollup, not a reimplementation.
 *
 * OUTCOME is the goal's OWN goal_progress rows, not goal_outcome_rollup. The
 * rollup is depth-limited and refuses to cross undeclared unit boundaries, and
 * it reports what it refused; running it per day would either produce a refusal
 * list per day or quietly drop one. The goal detail card already keeps
 * "Measured" and "Derived from children" visually apart for the same reason.
 * See docs/DECISIONS.md 020 — and the UI must label this series as measured
 * progress entered against this goal, never as its total outcome.
 *
 * BOTH CUMULATIVES ACCUMULATE WITHIN THE RANGE, from zero at p_from. They are
 * not lifetime totals; goal_effort_rollup and goal_outcome_rollup are, and the
 * dashboard shows those separately.
 */
create or replace function public.effort_outcome_series(
  p_goal_id uuid,
  p_from date,
  p_to date,
  p_user_id uuid default null
)
returns table (
  day                     date,
  effort_hours            numeric,
  cumulative_effort_hours numeric,
  outcome_value           numeric,
  cumulative_outcome      numeric
)
language sql
stable
as $$
  with bounds as (
    select p.id as user_id,
           p.timezone,
           (p_from::timestamp)     at time zone p.timezone as from_at,
           ((p_to + 1)::timestamp) at time zone p.timezone as to_at
    from public.profiles p
    where p.id = coalesce(p_user_id, (select auth.uid()))
  ),
  -- Cross joined to bounds so that a caller who cannot see the profile — RLS
  -- filtered it — gets no days at all rather than an empty-looking series.
  days as (
    select d::date as day
    from bounds b
    cross join generate_series(p_from, p_to, interval '1 day') d
  ),
  effort as (
    select (t.slot_start at time zone b.timezone)::date as day,
           sum(0.25 * s.share) as hours
    from bounds b
    join public.time_slots t
      on t.user_id = b.user_id
     and t.kind = 'actual'
     and t.slot_start >= b.from_at
     and t.slot_start <  b.to_at
    join public.goal_effort_shares(p_goal_id) s on s.goal_id = t.goal_id
    group by 1
  ),
  outcome as (
    select gp.date as day, sum(gp.value) as value
    from bounds b
    join public.goal_progress gp
      on gp.user_id = b.user_id
     and gp.goal_id = p_goal_id
     and gp.date between p_from and p_to
    group by 1
  )
  select days.day,
         -- A day with no slots really is zero effort: the ledger is dense by
         -- construction, so absence here is a measurement.
         coalesce(effort.hours, 0),
         sum(coalesce(effort.hours, 0)) over (order by days.day),
         -- A day with no progress row is NOT a measurement of zero. It stays
         -- null so the chart breaks rather than drawing a line through it.
         outcome.value,
         -- And the cumulative stays null until the first real entry, so a range
         -- with no measurements at all draws nothing instead of a flat zero.
         case
           when count(outcome.value) over (order by days.day) = 0 then null
           else sum(coalesce(outcome.value, 0)) over (order by days.day)
         end
  from days
  left join effort  on effort.day  = days.day
  left join outcome on outcome.day = days.day
  order by days.day;
$$;

comment on function public.effort_outcome_series is
  'Weighted effort hours and measured outcome for one goal, per day, as two series that are never combined. Outcome is the goal''s own entered progress, not the depth-limited rollup. Null outcome means no entry, which is not an entry of zero.';

-- ---------------------------------------------------------------- attention

/*
 * The goals where something is actually true.
 *
 * A selection over goal_pace and blocked_goals, computing nothing of its own. It
 * exists because goal_pace is per-goal plpgsql and the dashboard would otherwise
 * make one round trip per goal to find the handful that need looking at.
 *
 * The filter is deliberately narrow: overdue, stalled and behind, plus anything
 * with an unfinished prerequisite. on_track, ahead, complete, unmeasured and
 * no_data are all fine or all unknowable, and a list that includes them is a
 * list of every goal — which nobody reads, which makes it worse than no list.
 *
 * Goals with status 'blocked' are included rather than filtered out, matching
 * blocked_goals(), which excludes only done and abandoned.
 */
create or replace function public.goals_needing_attention(
  p_as_of date,
  p_user_id uuid default null
)
returns table (
  goal_id        uuid,
  title          text,
  horizon        public.goal_horizon,
  due_date       date,
  days_remaining int,
  required_rate  numeric,
  achieved_rate  numeric,
  pace_ratio     numeric,
  status         text,
  is_blocked     boolean,
  blocker_titles text[]
)
language sql
stable
as $$
  with blockers as (
    select b.goal_id,
           array_agg(b.blocker_title order by b.blocker_title) as titles
    from public.blocked_goals() b
    group by b.goal_id
  ),
  scored as (
    select g.id, g.title as goal_title, g.horizon as goal_horizon,
           pc.*,
           bl.titles
    from public.goals g
    cross join lateral public.goal_pace(g.id, p_as_of) pc
    left join blockers bl on bl.goal_id = g.id
    where g.user_id = coalesce(p_user_id, (select auth.uid()))
      and g.status not in ('done', 'abandoned')
  )
  select scored.id,
         scored.goal_title,
         scored.goal_horizon,
         scored.due_date,
         scored.days_remaining,
         scored.required_rate,
         scored.achieved_rate,
         scored.pace_ratio,
         scored.status,
         scored.titles is not null,
         scored.titles
  from scored
  where scored.status in ('overdue', 'stalled', 'behind')
     or scored.titles is not null
  order by case scored.status
             when 'overdue' then 0
             when 'stalled' then 1
             when 'behind'  then 2
             else 3
           end,
           scored.due_date nulls last,
           scored.goal_title;
$$;

comment on function public.goals_needing_attention is
  'Goals that are overdue, stalled, behind, or waiting on an unfinished prerequisite, with the pace figures behind that verdict. A selection over goal_pace and blocked_goals; it computes nothing itself.';
