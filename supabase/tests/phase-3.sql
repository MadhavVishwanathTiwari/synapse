-- Synapse — Phase 3 assertions
--
-- Run with `npm run db:test` (every file in supabase/tests, name order) or
-- `npm run db:test -- supabase/tests/phase-3.sql`. Everything here executes
-- inside a transaction the runner always rolls back, so it is safe against the
-- real database.
--
-- As in Phases 1 and 2, most assertions run as a real `authenticated` identity
-- rather than as postgres: every function under test is security invoker, so
-- running them as a superuser would bypass RLS and never exercise the path the
-- app takes.
--
-- Each passing assertion raises a notice beginning PASS; the runner counts them.
--
-- THE FIXTURE RANGE is 2026-03-10 to 2026-03-12 in Asia/Kolkata (+05:30, no DST
-- ever), with the default waking window of 07:00–23:00 — 64 slots of each day's
-- 96. The three days are chosen so that each one exercises a different way for a
-- metric to be undefined:
--
--   2026-03-10   planned 09:00–10:00   4 slots  Deep Work, goal A
--                actual  09:00–10:00   4 slots  Deep Work, goal A   honoured
--                actual  13:00–14:00   4 slots  Distraction         unproductive
--                actual  20:00–21:00   4 slots  no category         UNCLASSIFIED
--                → coverage 12/64, fidelity 4/4
--
--   2026-03-11   NOTHING PLANNED
--                actual  09:00–10:00   4 slots  Deep Work, goal A
--                → coverage 4/64, fidelity NULL — and the row is still present
--
--   2026-03-12   nothing at all
--                → coverage 0/64 = 0 (a real measurement), fidelity NULL
--
-- Allocation over the whole range, with a pen:
--
--   Deep Work      8 slots  2.0 h  productive       share 2.0 / 4.0 = 0.5
--   Distraction    4 slots  1.0 h  NOT productive   share 1.0 / 4.0 = 0.25
--   (uncategorised)4 slots  1.0 h  NO FLAG AT ALL   share 1.0 / 4.0 = 0.25
--   logged        16 slots  4.0 h                   productive_share  8/16 = 0.5
--
-- The uncategorised row is the case the phase brief singles out: time that is
-- logged but has no productive flag either way. It must appear, it must count
-- towards the denominator, and its is_productive must be null rather than false.
--
-- THE GOAL GRAPH is the Phase 1 diamond, so the effort weighting is exercised
-- rather than trivially 1.0:
--
--   D ──1.0──> B ──0.5──┐
--   D ──1.0──> C ──0.5──┴──> A          (parent ──weight──> child)
--
-- Goal A holds all 8 of the goal-attributed slots (2.0 h). Read from B, A's
-- share is 0.5, so B's effort is 1.0 h — 0.5 h on each of the two days.
--
-- These numbers are mirrored in src/lib/metrics/__fixtures__/phase-3.ts. The SQL
-- here is authoritative; holding both to one set of figures is what turns a
-- drift between them into a failing gate rather than a quiet disagreement
-- between the dashboard and the Telegram bot.

-- ---------------------------------------------------------------- fixtures

-- Two users. Only postgres can write auth.users, so this happens before the
-- identity switch. The handle_new_user trigger seeds profiles and categories.
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'a@synapse.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@synapse.test');

-- ---------------------------------------------------------------- act as A

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',
  true
);

do $$
begin
  assert (select auth.uid()) = '00000000-0000-0000-0000-0000000000a1'::uuid,
    'identity switch failed: auth.uid() did not resolve to user A';
  raise notice 'PASS 00  identity resolves to user A';
end $$;

do $$
declare v_tz text; v_start time; v_end time; v_prod boolean;
begin
  select timezone, waking_start, waking_end into v_tz, v_start, v_end
  from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';

  -- Every figure in this file is computed against these values.
  assert v_tz = 'Asia/Kolkata', format('timezone default is %s', v_tz);
  assert v_start = '07:00' and v_end = '23:00',
    format('waking window default is %s–%s', v_start, v_end);

  -- And against these flags. If the starter category set ever changes, the
  -- allocation figures below change with it and this is where it surfaces.
  select is_productive into v_prod from public.categories
   where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Deep Work';
  assert v_prod, 'Deep Work is expected to be productive';

  select is_productive into v_prod from public.categories
   where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Distraction';
  assert not v_prod, 'Distraction is expected to be unproductive';

  raise notice 'PASS 01  fixture assumptions hold (Asia/Kolkata, 07:00–23:00, seeded flags)';
end $$;

-- The Phase 1 diamond. B carries the target and the measured progress, so it is
-- the goal the divergence series is read from.
insert into public.goals (id, user_id, horizon, title, start_date, due_date, metric_unit, target_value)
values
  ('d0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000a1', 'decade', 'D top',    '2026-01-01', '2036-01-01', null, null),
  ('b0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 'year',   'B middle', '2026-03-01', '2026-03-11', 'units', 10),
  ('c0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1', 'year',   'C middle', '2026-01-01', '2026-12-31', null, null),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'day',    'A leaf',   '2026-03-10', '2026-03-12', null, null);

insert into public.goal_links (parent_id, child_id, user_id, link_type, contribution_weight)
values
  ('d0000000-0000-0000-0000-00000000000d', 'b0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 1.0),
  ('d0000000-0000-0000-0000-00000000000d', 'c0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 1.0),
  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 0.5),
  ('c0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 0.5);

-- A is a prerequisite of C, and A is unfinished — so C is blocked. The budget
-- trigger ignores depends_on, so this does not disturb C's contributes_to
-- weights.
insert into public.goal_links (parent_id, child_id, user_id, link_type)
values ('a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c',
        '00000000-0000-0000-0000-0000000000a1', 'depends_on');

-- ---------------------------------------------------------------- the fixture days

-- 2026-03-10 — planned and honoured, plus unproductive and unclassified time.
insert into public.time_slots (user_id, slot_start, kind, goal_id, category_id)
select '00000000-0000-0000-0000-0000000000a1', s, 'planned',
       'a0000000-0000-0000-0000-00000000000a',
       (select id from public.categories
         where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Deep Work')
from generate_series('2026-03-10 09:00:00+05:30'::timestamptz,
                     '2026-03-10 09:45:00+05:30'::timestamptz,
                     interval '15 minutes') s;

insert into public.time_slots (user_id, slot_start, kind, goal_id, category_id)
select '00000000-0000-0000-0000-0000000000a1', s, 'actual',
       'a0000000-0000-0000-0000-00000000000a',
       (select id from public.categories
         where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Deep Work')
from generate_series('2026-03-10 09:00:00+05:30'::timestamptz,
                     '2026-03-10 09:45:00+05:30'::timestamptz,
                     interval '15 minutes') s;

insert into public.time_slots (user_id, slot_start, kind, category_id)
select '00000000-0000-0000-0000-0000000000a1', s, 'actual',
       (select id from public.categories
         where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Distraction')
from generate_series('2026-03-10 13:00:00+05:30'::timestamptz,
                     '2026-03-10 13:45:00+05:30'::timestamptz,
                     interval '15 minutes') s;

-- No category and no goal: "something happened here and I am not classifying
-- it". Still an account of the time, and still in every denominator.
insert into public.time_slots (user_id, slot_start, kind)
select '00000000-0000-0000-0000-0000000000a1', s, 'actual'
from generate_series('2026-03-10 20:00:00+05:30'::timestamptz,
                     '2026-03-10 20:45:00+05:30'::timestamptz,
                     interval '15 minutes') s;

-- 2026-03-11 — lived and logged, but never planned. The fidelity-null day.
insert into public.time_slots (user_id, slot_start, kind, goal_id, category_id)
select '00000000-0000-0000-0000-0000000000a1', s, 'actual',
       'a0000000-0000-0000-0000-00000000000a',
       (select id from public.categories
         where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Deep Work')
from generate_series('2026-03-11 09:00:00+05:30'::timestamptz,
                     '2026-03-11 09:45:00+05:30'::timestamptz,
                     interval '15 minutes') s;

-- 2026-03-12 — deliberately empty. No plan, no actual, no rows anywhere.

-- One measurement, on the middle day only.
insert into public.goal_progress (goal_id, user_id, date, value)
values ('b0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1',
        '2026-03-11', 3);

-- ================================================================ allocation

do $$
declare r record; v_n int;
begin
  select count(*) into v_n from public.allocation('2026-03-10', '2026-03-12');
  assert v_n = 3, format('allocation returned %s rows, expected 3', v_n);

  select * into r from public.allocation('2026-03-10', '2026-03-12') a
   where a.category_name = 'Deep Work';
  assert r.actual_hours = 2.0, format('Deep Work hours were %s, expected 2.0', r.actual_hours);
  assert r.is_productive, 'Deep Work should be flagged productive';
  assert r.logged_hours = 4.0, format('logged_hours was %s, expected 4.0', r.logged_hours);
  assert r.share = 0.5, format('Deep Work share was %s, expected 0.5', r.share);

  select * into r from public.allocation('2026-03-10', '2026-03-12') a
   where a.category_name = 'Distraction';
  assert r.actual_hours = 1.0, format('Distraction hours were %s, expected 1.0', r.actual_hours);
  assert r.is_productive is false, 'Distraction should be flagged unproductive';
  assert r.share = 0.25, format('Distraction share was %s, expected 0.25', r.share);

  raise notice 'PASS 02  allocation splits productive and unproductive hours by hand-computed shares';
end $$;

do $$
declare r record;
begin
  /*
   * The case the phase brief singles out: time that is logged but carries no
   * productive flag either way. Dropping this row would make the shares fail to
   * sum to the range; reporting is_productive as false would invent a judgement
   * that was never recorded.
   */
  select * into r from public.allocation('2026-03-10', '2026-03-12') a
   where a.category_id is null;
  assert found, 'the uncategorised row was dropped from allocation';
  assert r.category_name is null, 'the uncategorised row should have no name';
  assert r.is_productive is null,
    format('uncategorised is_productive was %s, expected null', r.is_productive);
  assert r.actual_hours = 1.0, format('uncategorised hours were %s, expected 1.0', r.actual_hours);
  assert r.share = 0.25, format('uncategorised share was %s, expected 0.25', r.share);
  raise notice 'PASS 03  unclassified time is kept, counted, and left unflagged';
end $$;

do $$
declare v_n int;
begin
  -- A range with nothing in it has no categories to report. The summary below
  -- is what still answers for that case.
  select count(*) into v_n from public.allocation('2026-04-01', '2026-04-02');
  assert v_n = 0, format('allocation over an empty range returned %s rows', v_n);
  raise notice 'PASS 04  allocation over an empty range returns no category rows';
end $$;

do $$
declare r record;
begin
  select * into r from public.allocation_summary('2026-03-10', '2026-03-12');
  assert r.productive_hours = 2.0,
    format('productive hours were %s, expected 2.0', r.productive_hours);
  assert r.unproductive_hours = 1.0,
    format('unproductive hours were %s, expected 1.0', r.unproductive_hours);
  assert r.unclassified_hours = 1.0,
    format('unclassified hours were %s, expected 1.0', r.unclassified_hours);
  assert r.logged_hours = 4.0,
    format('logged hours were %s, expected 4.0', r.logged_hours);
  -- Unclassified time stays in the denominator: 2.0 / 4.0, not 2.0 / 3.0.
  assert r.productive_share = 0.5,
    format('productive share was %s, expected 0.5', r.productive_share);
  raise notice 'PASS 05  allocation_summary totals are hand-computed, unclassified time in the denominator';
end $$;

do $$
declare v_rows numeric; v_total numeric;
begin
  select sum(a.actual_hours) into v_rows from public.allocation('2026-03-10', '2026-03-12') a;
  select s.logged_hours into v_total from public.allocation_summary('2026-03-10', '2026-03-12') s;
  -- Two grains of one metric. If they can disagree, one of them is wrong and
  -- nothing in the UI would reveal which.
  assert v_rows = v_total,
    format('per-category hours sum to %s but the summary says %s', v_rows, v_total);
  raise notice 'PASS 06  the two grains of allocation reconcile';
end $$;

do $$
declare r record; v_n int;
begin
  select count(*) into v_n from public.allocation_summary('2026-04-01', '2026-04-02');
  assert v_n = 1, format('allocation_summary returned %s rows for an empty range', v_n);

  select * into r from public.allocation_summary('2026-04-01', '2026-04-02');
  assert r.logged_hours = 0, format('empty range logged %s hours', r.logged_hours);
  -- The whole point: no hours means no allocation, not an allocation of zero.
  assert r.productive_share is null,
    format('empty range reported a share of %s instead of null', r.productive_share);
  raise notice 'PASS 07  a range with no hours has a null share, not a zero one';
end $$;

-- ================================================================ adherence_series

do $$
declare v_n int;
begin
  select count(*) into v_n from public.adherence_series('2026-03-10', '2026-03-12');
  -- Three days in, three days out. A day is never omitted for having no data;
  -- that is the difference between "nothing happened" and "we did not look".
  assert v_n = 3, format('adherence_series returned %s rows for a 3-day range', v_n);
  raise notice 'PASS 08  adherence_series returns one row per day of the range';
end $$;

do $$
declare r record;
begin
  select * into r from public.adherence_series('2026-03-10', '2026-03-12') s
   where s.day = '2026-03-10';
  assert r.logged = 12, format('day 1 logged %s slots, expected 12', r.logged);
  assert r.expected = 64, format('day 1 expected %s slots, expected 64', r.expected);
  assert r.coverage = 0.1875, format('day 1 coverage was %s, expected 0.1875', r.coverage);
  assert r.planned = 4 and r.honoured = 4,
    format('day 1 honoured %s of %s planned', r.honoured, r.planned);
  assert r.fidelity = 1.0, format('day 1 fidelity was %s, expected 1.0', r.fidelity);
  raise notice 'PASS 09  a planned-and-lived day comes back with both figures';
end $$;

do $$
declare r record;
begin
  /*
   * The single most important assertion in this file.
   *
   * A day that was lived but never planned must be PRESENT with a null
   * fidelity, not absent. A dropped row and a null row look identical in a
   * chart and mean completely different things: one breaks the line, the other
   * lets the library interpolate straight across and draw a number nobody ever
   * measured.
   */
  select * into r from public.adherence_series('2026-03-10', '2026-03-12') s
   where s.day = '2026-03-11';
  assert found, 'the unplanned day was missing from the series entirely';
  assert r.logged = 4, format('day 2 logged %s slots, expected 4', r.logged);
  assert r.coverage = 0.0625, format('day 2 coverage was %s, expected 0.0625', r.coverage);
  assert r.planned = 0, format('day 2 reported %s planned slots', r.planned);
  assert r.fidelity is null,
    format('day 2 fidelity was %s, expected null — a day with no plan has a fidelity of nothing', r.fidelity);
  raise notice 'PASS 10  a day with no plan is a null row inside the series, not a missing one';
end $$;

do $$
declare r record;
begin
  select * into r from public.adherence_series('2026-03-10', '2026-03-12') s
   where s.day = '2026-03-12';
  assert found, 'a day with no slots at all was dropped from the series';
  assert r.logged = 0 and r.expected = 64,
    format('empty day reported %s of %s slots', r.logged, r.expected);
  -- Zero here is a real measurement: the window existed and nothing was logged
  -- in it. That is not the same as the null above.
  assert r.coverage = 0, format('empty day coverage was %s, expected 0', r.coverage);
  assert r.fidelity is null, format('empty day fidelity was %s, expected null', r.fidelity);
  raise notice 'PASS 11  a day with no rows at all is present, with zero coverage and null fidelity';
end $$;

do $$
declare s record; c record; f record;
begin
  -- The series calls day_coverage and day_fidelity rather than restating them.
  -- This asserts that it still does: if anyone rewrites it as a single pass for
  -- speed, these stop matching and the gate fires. Hard rule 1.
  select * into s from public.adherence_series('2026-03-10', '2026-03-12') x
   where x.day = '2026-03-10';
  select * into c from public.day_coverage('2026-03-10');
  select * into f from public.day_fidelity('2026-03-10');

  assert s.logged = c.logged and s.expected = c.expected and s.coverage = c.coverage,
    'adherence_series disagrees with day_coverage on the same day';
  assert s.planned = f.planned and s.honoured = f.honoured and s.fidelity = f.fidelity,
    'adherence_series disagrees with day_fidelity on the same day';
  raise notice 'PASS 12  the series agrees exactly with the per-day functions it calls';
end $$;

-- ================================================================ effort_outcome_series

do $$
declare v_n int; r record;
begin
  select count(*) into v_n
  from public.effort_outcome_series('b0000000-0000-0000-0000-00000000000b',
                                    '2026-03-10', '2026-03-12');
  assert v_n = 3, format('effort_outcome_series returned %s rows, expected 3', v_n);

  /*
   * Goal A holds 4 actual slots on this day — 1.0 h. Read from B, A's
   * accumulated contribution share is 0.5, so B sees 0.5 h. If this returns 1.0
   * the weighting has been lost somewhere and every ancestor total in the app is
   * inflated.
   */
  select * into r
  from public.effort_outcome_series('b0000000-0000-0000-0000-00000000000b',
                                    '2026-03-10', '2026-03-12') e
   where e.day = '2026-03-10';
  assert r.effort_hours = 0.5,
    format('day 1 effort was %s h, expected 0.5 (1.0 h at a share of 0.5)', r.effort_hours);
  assert r.cumulative_effort_hours = 0.5,
    format('day 1 cumulative effort was %s', r.cumulative_effort_hours);
  raise notice 'PASS 13  effort is weighted by the accumulated contribution share';
end $$;

do $$
declare r record;
begin
  select * into r
  from public.effort_outcome_series('b0000000-0000-0000-0000-00000000000b',
                                    '2026-03-10', '2026-03-12') e
   where e.day = '2026-03-12';
  -- No slots on this day at all. Effort of zero is a real measurement here: the
  -- ledger is dense by construction, so an unlogged day genuinely had no hours.
  assert r.effort_hours = 0, format('empty day effort was %s, expected 0', r.effort_hours);
  assert r.cumulative_effort_hours = 1.0,
    format('cumulative effort was %s, expected 1.0 (0.5 on each of two days)',
           r.cumulative_effort_hours);
  raise notice 'PASS 14  effort accumulates across the range and a slotless day is a true zero';
end $$;

do $$
declare r record;
begin
  /*
   * Outcome is the other half of the divergence, and the two are never combined
   * into a completion percentage — that is the whole reason the rollups were
   * kept apart. See docs/DECISIONS.md 004 and 020.
   *
   * Day 1 has effort but no measurement. The outcome must be NULL, not 0: "no
   * entry" and "entered zero" are different facts, and a chart drawn from the
   * second one claims a measurement that was never taken.
   */
  select * into r
  from public.effort_outcome_series('b0000000-0000-0000-0000-00000000000b',
                                    '2026-03-10', '2026-03-12') e
   where e.day = '2026-03-10';
  assert r.effort_hours > 0, 'day 1 should have effort';
  assert r.outcome_value is null,
    format('day 1 outcome was %s, expected null — nothing was entered', r.outcome_value);
  -- And nothing has been measured yet, so there is no running total either.
  assert r.cumulative_outcome is null,
    format('day 1 cumulative outcome was %s, expected null', r.cumulative_outcome);

  select * into r
  from public.effort_outcome_series('b0000000-0000-0000-0000-00000000000b',
                                    '2026-03-10', '2026-03-12') e
   where e.day = '2026-03-11';
  assert r.outcome_value = 3, format('day 2 outcome was %s, expected 3', r.outcome_value);
  assert r.cumulative_outcome = 3, format('day 2 cumulative was %s, expected 3', r.cumulative_outcome);

  select * into r
  from public.effort_outcome_series('b0000000-0000-0000-0000-00000000000b',
                                    '2026-03-10', '2026-03-12') e
   where e.day = '2026-03-12';
  assert r.outcome_value is null,
    format('day 3 outcome was %s, expected null', r.outcome_value);
  -- The cumulative carries forward as a step. Nothing new was measured, so the
  -- total did not change — which is different from it having fallen to zero.
  assert r.cumulative_outcome = 3,
    format('day 3 cumulative was %s, expected 3 carried forward', r.cumulative_outcome);

  raise notice 'PASS 15  outcome is null where nothing was entered, and the cumulative starts at the first measurement';
end $$;

do $$
declare v_n int; r record;
begin
  -- A goal with effort beneath it but no measurement anywhere: one series has
  -- data, the other has none, and neither is faked to match the other.
  select count(*) into v_n
  from public.effort_outcome_series('d0000000-0000-0000-0000-00000000000d',
                                    '2026-03-10', '2026-03-12') e
   where e.outcome_value is not null;
  assert v_n = 0, format('D reported %s outcome entries, expected none', v_n);

  select * into r
  from public.effort_outcome_series('d0000000-0000-0000-0000-00000000000d',
                                    '2026-03-10', '2026-03-12') e
   where e.day = '2026-03-12';
  -- Read from D, A's share is 0.5 + 0.5 = 1.0 across the diamond, so all 2.0 h
  -- arrive — counted exactly once, not twice.
  assert r.cumulative_effort_hours = 2.0,
    format('D cumulative effort was %s, expected 2.0', r.cumulative_effort_hours);
  assert r.cumulative_outcome is null,
    format('D cumulative outcome was %s, expected null throughout', r.cumulative_outcome);
  raise notice 'PASS 16  a range where effort has data and outcome has none reports exactly that';
end $$;

-- ================================================================ goals_needing_attention

do $$
declare r record; v_n int;
begin
  /*
   * B has a target of 10 units, 3 measured, and a deadline of 2026-03-11. As of
   * the 12th it is past its deadline with work outstanding: overdue.
   */
  select * into r from public.goals_needing_attention('2026-03-12') g
   where g.goal_id = 'b0000000-0000-0000-0000-00000000000b';
  assert found, 'the overdue goal was not reported';
  assert r.status = 'overdue', format('B status was %s, expected overdue', r.status);
  assert r.days_remaining < 0, format('B days_remaining was %s', r.days_remaining);
  assert not r.is_blocked, 'B is not blocked by anything';

  -- C has no target at all, so pace is unmeasured — but it waits on A, which is
  -- unfinished, and that is a reason to surface it.
  select * into r from public.goals_needing_attention('2026-03-12') g
   where g.goal_id = 'c0000000-0000-0000-0000-00000000000c';
  assert found, 'the blocked goal was not reported';
  assert r.is_blocked, 'C should be flagged blocked';
  assert r.blocker_titles = array['A leaf'],
    format('C blockers were %s, expected {A leaf}', r.blocker_titles);

  -- D is neither. A list that includes every goal is a list nobody reads.
  select count(*) into v_n from public.goals_needing_attention('2026-03-12') g
   where g.goal_id = 'd0000000-0000-0000-0000-00000000000d';
  assert v_n = 0, 'D has nothing wrong with it and should not be listed';

  raise notice 'PASS 17  attention lists overdue and blocked goals and nothing else';
end $$;

-- ---------------------------------------------------------------- act as B

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}',
  true
);

do $$
begin
  assert (select auth.uid()) = '00000000-0000-0000-0000-0000000000b2'::uuid,
    'identity switch to user B failed';
  raise notice 'PASS 30  identity resolves to user B';
end $$;

do $$
declare v_n int; r record;
begin
  /*
   * Every function is security invoker, so B running one sees B's own empty
   * ledger. Passing A's id as p_user_id grants nothing — RLS filters profiles,
   * so the bounds CTE finds no row and the range collapses to nothing.
   *
   * A security definer function here would have leaked the lot while every
   * table policy stayed perfectly correct, which is why this is asserted rather
   * than assumed.
   */
  select count(*) into v_n
  from public.allocation('2026-03-10', '2026-03-12', '00000000-0000-0000-0000-0000000000a1');
  assert v_n = 0, format('user B read %s allocation rows of user A''s', v_n);

  select * into r
  from public.allocation_summary('2026-03-10', '2026-03-12', '00000000-0000-0000-0000-0000000000a1');
  assert r.logged_hours = 0,
    format('user B read %s of user A''s logged hours', r.logged_hours);
  assert r.productive_share is null,
    'user B got a share figure out of user A''s range';

  raise notice 'PASS 31  allocation leaks nothing across users, with or without p_user_id';
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n
  from public.adherence_series('2026-03-10', '2026-03-12', '00000000-0000-0000-0000-0000000000a1') s
   where s.logged > 0 or s.planned > 0;
  -- The rows themselves still exist — the series is generated from the date
  -- range, not from the data — but every figure in them is empty.
  assert v_n = 0, format('user B saw %s of user A''s logged days', v_n);
  raise notice 'PASS 32  adherence_series returns no data for another user''s days';
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n
  from public.effort_outcome_series('b0000000-0000-0000-0000-00000000000b',
                                    '2026-03-10', '2026-03-12',
                                    '00000000-0000-0000-0000-0000000000a1');
  -- Here the rows vanish entirely: the day list is cross joined to the profile
  -- bounds, which B cannot see.
  assert v_n = 0, format('user B pulled %s rows of user A''s divergence series', v_n);
  raise notice 'PASS 33  effort_outcome_series returns nothing for another user''s goal';
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n
  from public.goals_needing_attention('2026-03-12', '00000000-0000-0000-0000-0000000000a1');
  assert v_n = 0, format('user B read %s of user A''s at-risk goals', v_n);
  raise notice 'PASS 34  goals_needing_attention leaks no goals across users';
end $$;

reset role;
