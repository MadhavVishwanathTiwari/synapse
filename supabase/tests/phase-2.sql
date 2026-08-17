-- Synapse — Phase 2 assertions
--
-- Run with `npm run db:test -- supabase/tests/phase-2.sql`. Everything here
-- executes inside a transaction the runner always rolls back, so it is safe
-- against the real database.
--
-- As in Phase 1, most assertions run as a real `authenticated` identity rather
-- than as postgres: every function under test is security invoker, so running
-- them as a superuser would bypass RLS and never exercise the path the app takes.
--
-- Each passing assertion raises a notice beginning PASS; the runner counts them.
--
-- THE FIXTURE DAY is 2026-03-10 in Asia/Kolkata (+05:30, no DST ever), with the
-- default waking window of 07:00–23:00 — 64 slots of the day's 96.
--
--   planned   09:00–10:00  4 slots  goal A, Deep Work
--             10:00–10:30  2 slots  Learning, no goal
--             20:00–20:15  1 slot   Gym, no goal
--                          7 planned
--
--   actual    09:00–10:00  4 slots  goal A, Deep Work    honours the goal
--             10:00–10:15  1 slot   Learning             honours the category
--             10:15–10:30  1 slot   Distraction          breaks it
--             14:00–15:00  4 slots  goal A, Deep Work    unplanned
--             05:00–05:15  1 slot   Sleep                outside the window
--                         11 actual, 10 of them in the waking window
--
-- Every expected figure below follows from that table with a pen:
--   coverage  10 / 64        = 0.15625
--   fidelity   5 / 7         (the 20:00 commitment and the 10:15 swap are misses)
--   own hours  8 actual slots x 0.25 = 2.0   (the 4 PLANNED slots do not count)

-- ---------------------------------------------------------------- fixtures

-- Two users. Only postgres can write auth.users, so this happens before the
-- identity switch. The handle_new_user trigger seeds profiles and categories.
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'a@synapse.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@synapse.test');

-- A goal belonging to B, created as postgres so it already exists while acting
-- as A. Without it the cross-user assertion would pass for the wrong reason: a
-- missing row also violates the foreign key.
insert into public.goals (id, user_id, horizon, title, start_date, due_date)
values ('f0000000-0000-0000-0000-00000000000f', '00000000-0000-0000-0000-0000000000b2',
        'year', 'B own goal', '2026-01-01', '2026-12-31');

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
declare v_tz text; v_start time; v_end time;
begin
  select timezone, waking_start, waking_end into v_tz, v_start, v_end
  from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';

  -- Every figure in this file is computed against these three values.
  assert v_tz = 'Asia/Kolkata', format('timezone default is %s', v_tz);
  assert v_start = '07:00' and v_end = '23:00',
    format('waking window default is %s–%s', v_start, v_end);
  raise notice 'PASS 01  fixture assumptions hold (Asia/Kolkata, 07:00–23:00)';
end $$;

-- The Phase 1 diamond, rebuilt here so the rollup assertions are self-contained.
--   D ──1.0──> B ──0.5──┐
--   D ──1.0──> C ──0.5──┴──> A        (parent ──weight──> child)
insert into public.goals (id, user_id, horizon, title, start_date, due_date)
values
  ('d0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000a1', 'decade', 'D top',    '2026-01-01', '2036-01-01'),
  ('b0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 'year',   'B middle', '2026-01-01', '2026-12-31'),
  ('c0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1', 'year',   'C middle', '2026-01-01', '2026-12-31'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'day',    'A leaf',   '2026-03-10', '2026-03-10');

insert into public.goal_links (parent_id, child_id, user_id, link_type, contribution_weight)
values
  ('d0000000-0000-0000-0000-00000000000d', 'b0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 1.0),
  ('d0000000-0000-0000-0000-00000000000d', 'c0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 1.0),
  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 0.5),
  ('c0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 0.5);

-- ================================================================ constraints

do $$
begin
  begin
    -- 09:07 is not on a quarter hour. Every metric downstream counts rows and
    -- multiplies by 0.25, so a slot of some other length is silent corruption.
    insert into public.time_slots (user_id, slot_start, kind)
    values ('00000000-0000-0000-0000-0000000000a1',
            '2026-03-10 09:07:00+05:30', 'actual');
    raise exception 'an unaligned slot_start was accepted';
  exception when check_violation then
    raise notice 'PASS 02  unaligned slot_start rejected by slot_aligned';
  end;
end $$;

do $$
begin
  begin
    -- Seconds are not a quarter hour either.
    insert into public.time_slots (user_id, slot_start, kind)
    values ('00000000-0000-0000-0000-0000000000a1',
            '2026-03-10 09:15:01+05:30', 'actual');
    raise exception 'a slot with a non-zero second offset was accepted';
  exception when check_violation then
    raise notice 'PASS 03  sub-minute drift rejected too';
  end;
end $$;

do $$
begin
  begin
    -- RLS lets A write a row carrying A's user_id; the composite foreign key is
    -- what proves the goal is also A's. This is the check RLS alone cannot make.
    insert into public.time_slots (user_id, slot_start, kind, goal_id)
    values ('00000000-0000-0000-0000-0000000000a1',
            '2026-03-10 09:00:00+05:30', 'actual',
            'f0000000-0000-0000-0000-00000000000f');
    raise exception 'a slot against another user''s goal was accepted';
  exception when foreign_key_violation then
    raise notice 'PASS 04  a slot referencing another user''s goal is rejected';
  end;
end $$;

-- ---------------------------------------------------------------- the fixture day

insert into public.time_slots (user_id, slot_start, kind, goal_id, category_id)
select '00000000-0000-0000-0000-0000000000a1', s, 'planned',
       'a0000000-0000-0000-0000-00000000000a',
       (select id from public.categories
         where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Deep Work')
from generate_series('2026-03-10 09:00:00+05:30'::timestamptz,
                     '2026-03-10 09:45:00+05:30'::timestamptz,
                     interval '15 minutes') s;

insert into public.time_slots (user_id, slot_start, kind, category_id)
select '00000000-0000-0000-0000-0000000000a1', s, 'planned',
       (select id from public.categories
         where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Learning')
from generate_series('2026-03-10 10:00:00+05:30'::timestamptz,
                     '2026-03-10 10:15:00+05:30'::timestamptz,
                     interval '15 minutes') s;

insert into public.time_slots (user_id, slot_start, kind, category_id)
values ('00000000-0000-0000-0000-0000000000a1', '2026-03-10 20:00:00+05:30', 'planned',
        (select id from public.categories
          where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Gym'));

insert into public.time_slots (user_id, slot_start, kind, goal_id, category_id)
select '00000000-0000-0000-0000-0000000000a1', s, 'actual',
       'a0000000-0000-0000-0000-00000000000a',
       (select id from public.categories
         where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Deep Work')
from generate_series('2026-03-10 09:00:00+05:30'::timestamptz,
                     '2026-03-10 09:45:00+05:30'::timestamptz,
                     interval '15 minutes') s;

insert into public.time_slots (user_id, slot_start, kind, category_id)
values
  ('00000000-0000-0000-0000-0000000000a1', '2026-03-10 10:00:00+05:30', 'actual',
   (select id from public.categories
     where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Learning')),
  ('00000000-0000-0000-0000-0000000000a1', '2026-03-10 10:15:00+05:30', 'actual',
   (select id from public.categories
     where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Distraction')),
  ('00000000-0000-0000-0000-0000000000a1', '2026-03-10 05:00:00+05:30', 'actual',
   (select id from public.categories
     where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Sleep'));

insert into public.time_slots (user_id, slot_start, kind, goal_id, category_id)
select '00000000-0000-0000-0000-0000000000a1', s, 'actual',
       'a0000000-0000-0000-0000-00000000000a',
       (select id from public.categories
         where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Deep Work')
from generate_series('2026-03-10 14:00:00+05:30'::timestamptz,
                     '2026-03-10 14:45:00+05:30'::timestamptz,
                     interval '15 minutes') s;

do $$
begin
  begin
    -- One planned and one actual per instant, never two of a kind.
    insert into public.time_slots (user_id, slot_start, kind)
    values ('00000000-0000-0000-0000-0000000000a1',
            '2026-03-10 09:00:00+05:30', 'actual');
    raise exception 'a second actual slot for the same instant was accepted';
  exception when unique_violation then
    raise notice 'PASS 05  two slots of the same kind at one instant rejected';
  end;
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.time_slots
  where slot_start = '2026-03-10 09:00:00+05:30';
  -- The property the whole phase rests on: the plan is not overwritten by what
  -- happened, so the divergence between them survives to be measured.
  assert v_n = 2, format('%s rows coexist at 09:00, expected planned + actual', v_n);
  raise notice 'PASS 06  planned and actual coexist for the same instant';
end $$;

-- ================================================================ the dense grid

do $$
declare v_n int;
begin
  select count(*) into v_n from public.get_day_grid('2026-03-10');
  -- 18 rows are stored for this day. The read is dense regardless.
  assert v_n = 96, format('the grid returned %s rows, expected 96', v_n);
  raise notice 'PASS 07  get_day_grid returns 96 rows for a sparsely stored day';
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.get_day_grid('2026-03-11');
  -- Nothing at all is stored for the 11th. "No data" must still be 96 slots of
  -- unaccounted time rather than an empty result the UI has to interpret.
  assert v_n = 96, format('an untouched day returned %s rows, expected 96', v_n);
  raise notice 'PASS 08  an untouched day is 96 unlogged slots, not zero rows';
end $$;

do $$
declare r record;
begin
  select * into r from public.get_day_grid('2026-03-10') where slot_index = 0;

  -- Local midnight IST is 18:30 UTC the previous day. Getting this wrong shifts
  -- every slot in the app by five and a half hours.
  assert r.slot_start = '2026-03-09 18:30:00+00'::timestamptz,
    format('slot 0 was %s, expected 2026-03-09 18:30Z', r.slot_start);
  assert r.local_time = '00:00', format('slot 0 local time was %s', r.local_time);
  raise notice 'PASS 09  slot 0 is local midnight projected onto UTC';
end $$;

do $$
declare v_bad int;
begin
  select count(*) into v_bad
  from public.get_day_grid('2026-03-10')
  where extract(epoch from slot_start)::bigint % 900 <> 0;
  assert v_bad = 0, format('%s generated slots were not 900-second aligned', v_bad);
  raise notice 'PASS 10  every generated slot is 900-second aligned';
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n
  from public.get_day_grid('2026-03-10') where in_waking_window;
  -- 07:00 to 23:00 is 16 hours: indices 28 through 91.
  assert v_n = 64, format('%s slots fell in the waking window, expected 64', v_n);
  raise notice 'PASS 11  the waking window is 64 of the day''s 96 slots';
end $$;

do $$
declare r record;
begin
  select * into r from public.get_day_grid('2026-03-10') where local_time = '10:15';

  -- The side-by-side join is what makes the day-close screen possible: the plan
  -- and what happened, at one instant, in one row.
  assert r.has_planned and r.has_actual, 'the 10:15 slot lost one of its two kinds';
  assert r.planned_category_id is distinct from r.actual_category_id,
    'the 10:15 swap from Learning to Distraction was flattened';
  raise notice 'PASS 12  planned and actual arrive side by side in one grid row';
end $$;

-- ================================================================ effort rollup

do $$
declare v_hours numeric;
begin
  v_hours := public.goal_own_hours('a0000000-0000-0000-0000-00000000000a');

  /*
   * 8 actual slots at a quarter hour each. The 4 PLANNED slots against the same
   * goal are excluded on purpose — counting intent as effort would let a user
   * roll up hours they never spent.
   */
  assert v_hours = 2.0, format('own hours were %s, expected 2.0', v_hours);
  raise notice 'PASS 13  goal_own_hours counts actual slots only (2.0 h)';
end $$;

do $$
declare v_roll numeric;
begin
  v_roll := public.goal_effort_rollup('d0000000-0000-0000-0000-00000000000d');

  /*
   * This is the assertion the whole phase exists to flip. Phase 1's counterpart
   * asserted 0 because nothing logged time; the recursion above goal_own_hours
   * has not changed by a character.
   *
   * A's 2.0 hours reach D twice — 1.0 x 0.5 through B and 1.0 x 0.5 through C —
   * summing to a share of exactly 1.0. Not 1.0 h (visited-set dedup would keep
   * one arm) and not 4.0 h (ignoring weights would count both in full).
   */
  assert v_roll = 2.0, format('the rollup at D was %s, expected 2.0', v_roll);
  raise notice 'PASS 14  the diamond rolls 2.0 h to the top, counted exactly once';
end $$;

do $$
declare v_b numeric; v_c numeric;
begin
  v_b := public.goal_effort_rollup('b0000000-0000-0000-0000-00000000000b');
  v_c := public.goal_effort_rollup('c0000000-0000-0000-0000-00000000000c');
  -- Each arm sees half, and the halves are what add back to the whole at D.
  assert v_b = 1.0 and v_c = 1.0,
    format('the arms saw %s and %s, expected 1.0 each', v_b, v_c);
  raise notice 'PASS 15  each arm of the diamond sees half the leaf''s hours';
end $$;

-- ================================================================ coverage

do $$
declare r record;
begin
  select * into r from public.day_coverage('2026-03-10');

  -- 11 actual slots exist; the 05:00 one is outside the waking window and is
  -- excluded rather than counted as a gap.
  assert r.logged = 10, format('logged was %s, expected 10', r.logged);
  assert r.expected = 64, format('expected was %s, expected 64', r.expected);
  assert r.coverage = 0.15625, format('coverage was %s, expected 0.15625', r.coverage);
  raise notice 'PASS 16  coverage is 10/64 — the 05:00 slot is excluded, not a gap';
end $$;

do $$
declare r record;
begin
  select * into r from public.day_coverage('2026-03-11');
  -- A real zero: the window exists and none of it is accounted for. Contrast
  -- with fidelity on the same day, immediately below.
  assert r.logged = 0 and r.expected = 64, format('%s of %s', r.logged, r.expected);
  assert r.coverage = 0, format('coverage was %s, expected 0', r.coverage);
  raise notice 'PASS 17  an unlogged day has coverage 0, not null';
end $$;

-- ================================================================ fidelity

do $$
declare r record;
begin
  select * into r from public.day_fidelity('2026-03-10');

  /*
   * 7 planned. Honoured: the four 09:00 slots (same goal) and the 10:00 slot
   * (same category). Missed: 10:15 went to Distraction instead of Learning, and
   * the 20:00 Gym commitment was never logged at all.
   */
  assert r.planned = 7,  format('planned was %s, expected 7', r.planned);
  assert r.honoured = 5, format('honoured was %s, expected 5', r.honoured);
  assert r.fidelity = 5::numeric / 7, format('fidelity was %s', r.fidelity);
  raise notice 'PASS 18  fidelity is 5/7, judged at the granularity planned';
end $$;

do $$
declare r record;
begin
  select * into r from public.day_fidelity('2026-03-11');

  /*
   * The assertion the brief singles out. A day with no plan has a fidelity of
   * NOTHING: 1.0 would reward never planning and 0 would punish it, and both are
   * claims about a ratio with no denominator.
   */
  assert r.planned = 0, format('planned was %s on an unplanned day', r.planned);
  assert r.fidelity is null,
    format('fidelity was %s on a day with no plan, expected null', r.fidelity);
  raise notice 'PASS 19  fidelity is null when nothing was planned, not 1.0 or 0';
end $$;

do $$
declare r record; v_cat uuid;
begin
  -- A goal-level commitment kept in the right category but on the wrong goal is
  -- a miss: the plan named a goal, so the goal is what it is judged against.
  select id into v_cat from public.categories
   where user_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Deep Work';

  insert into public.time_slots (user_id, slot_start, kind, goal_id, category_id)
  values ('00000000-0000-0000-0000-0000000000a1', '2026-03-12 09:00:00+05:30',
          'planned', 'a0000000-0000-0000-0000-00000000000a', v_cat),
         ('00000000-0000-0000-0000-0000000000a1', '2026-03-12 09:00:00+05:30',
          'actual', 'b0000000-0000-0000-0000-00000000000b', v_cat);

  select * into r from public.day_fidelity('2026-03-12');
  assert r.honoured = 0,
    'the right category on the wrong goal was scored as honouring a goal-level plan';
  raise notice 'PASS 20  a goal-level plan is judged on the goal, not the category';
end $$;

do $$
declare r record;
begin
  -- A plan with neither goal nor category is a commitment to account for the
  -- time at all, so any logged actual honours it.
  insert into public.time_slots (user_id, slot_start, kind, note)
  values ('00000000-0000-0000-0000-0000000000a1', '2026-03-13 09:00:00+05:30',
          'planned', 'something, anything'),
         ('00000000-0000-0000-0000-0000000000a1', '2026-03-13 09:00:00+05:30',
          'actual', 'read a book');

  select * into r from public.day_fidelity('2026-03-13');
  assert r.planned = 1 and r.honoured = 1,
    format('an unclassified plan scored %s of %s', r.honoured, r.planned);
  raise notice 'PASS 21  an unclassified plan is honoured by any logged actual';
end $$;

-- ================================================================ planning bias

do $$
declare r record;
begin
  select * into r from public.planning_bias('2026-03-10', '2026-03-10')
   where category_name = 'Deep Work';

  -- Planned 4 slots, spent 8. The under-budgeting this metric exists to surface.
  assert r.planned_hours = 1.0, format('planned was %s, expected 1.0', r.planned_hours);
  assert r.actual_hours = 2.0,  format('actual was %s, expected 2.0', r.actual_hours);
  assert r.bias_hours = 1.0,    format('bias was %s, expected +1.0', r.bias_hours);
  assert r.bias_ratio = 2.0,    format('ratio was %s, expected 2.0', r.bias_ratio);
  raise notice 'PASS 22  planning bias sees Deep Work at 2x its budget';
end $$;

do $$
declare r record;
begin
  select * into r from public.planning_bias('2026-03-10', '2026-03-10')
   where category_name = 'Gym';
  -- Planned and never done. A ratio of 0 is a real claim; the hours are the
  -- readable version of it.
  assert r.planned_hours = 0.25 and r.actual_hours = 0,
    format('Gym was %s planned / %s actual', r.planned_hours, r.actual_hours);
  assert r.bias_ratio = 0, format('Gym ratio was %s, expected 0', r.bias_ratio);
  raise notice 'PASS 23  a planned-but-skipped category has a ratio of 0';
end $$;

do $$
declare r record;
begin
  select * into r from public.planning_bias('2026-03-10', '2026-03-10')
   where category_name = 'Distraction';
  -- Spent without ever being budgeted. The ratio has no denominator, so there
  -- is no ratio — you cannot be biased about a budget you never set.
  assert r.planned_hours = 0 and r.actual_hours = 0.25,
    format('Distraction was %s / %s', r.planned_hours, r.actual_hours);
  assert r.bias_ratio is null,
    format('an unbudgeted category reported a ratio of %s', r.bias_ratio);
  raise notice 'PASS 24  an unplanned category reports null ratio, not infinity';
end $$;

do $$
declare v_n int;
begin
  select count(*) into v_n from public.planning_bias('2026-03-11', '2026-03-11');
  assert v_n = 0, format('a day with no slots produced %s bias rows', v_n);
  raise notice 'PASS 25  a range with no slots produces no bias rows';
end $$;

-- ================================================================ goal deletion

do $$
declare v_goal uuid; v_n int; v_attached uuid; v_user uuid;
begin
  insert into public.goals (user_id, horizon, title, start_date, due_date)
  values ('00000000-0000-0000-0000-0000000000a1', 'day', 'doomed', '2026-03-14', '2026-03-14')
  returning id into v_goal;

  insert into public.time_slots (user_id, slot_start, kind, goal_id)
  values ('00000000-0000-0000-0000-0000000000a1', '2026-03-14 09:00:00+05:30',
          'actual', v_goal);

  delete from public.goals where id = v_goal;

  select count(*) into v_n from public.time_slots
   where slot_start = '2026-03-14 09:00:00+05:30';
  select goal_id, user_id into v_attached, v_user from public.time_slots
   where slot_start = '2026-03-14 09:00:00+05:30';

  /*
   * Detachment, not cascade. Deleting a goal must not delete the record that the
   * time was spent — the hours are a fact about the day, not about the goal.
   *
   * user_id surviving is the other half: SET NULL on a composite key nulls every
   * referencing column unless the column list is named, and user_id is NOT NULL,
   * so the unqualified form would have made this delete fail outright.
   */
  assert v_n = 1, 'deleting a goal deleted the record that the time was spent';
  assert v_attached is null, format('the slot still points at %s', v_attached);
  assert v_user = '00000000-0000-0000-0000-0000000000a1',
    format('user_id was nulled to %s along with goal_id', v_user);
  raise notice 'PASS 26  deleting a goal detaches its slots and keeps them';
end $$;

-- ================================================================ DST

/*
 * Asia/Kolkata has no DST, so none of the above would catch a function that
 * assumed a fixed 96. These two days are the reason the grid is generated from
 * the real local day boundaries rather than from midnight plus 24 hours.
 */
do $$
declare v_n int; v_bad int;
begin
  update public.profiles set timezone = 'America/New_York'
   where id = '00000000-0000-0000-0000-0000000000a1';

  -- 2026-03-08: clocks go forward at 02:00. The day is 23 hours long.
  select count(*) into v_n from public.get_day_grid('2026-03-08');
  assert v_n = 92, format('the spring-forward day returned %s rows, expected 92', v_n);

  -- 2026-11-01: clocks go back at 02:00. The day is 25 hours long.
  select count(*) into v_n from public.get_day_grid('2026-11-01');
  assert v_n = 100, format('the fall-back day returned %s rows, expected 100', v_n);

  raise notice 'PASS 27  a DST day is 92 or 100 slots long, and says so';

  -- Alignment must survive the jump: every real DST offset is a whole number of
  -- quarter hours, so the 900-second invariant holds on both sides.
  select count(*) into v_bad
  from (select slot_start from public.get_day_grid('2026-03-08')
        union all
        select slot_start from public.get_day_grid('2026-11-01')) s
  where extract(epoch from s.slot_start)::bigint % 900 <> 0;
  assert v_bad = 0, format('%s slots lost alignment across a DST boundary', v_bad);
  raise notice 'PASS 28  slot alignment survives both DST transitions';

  update public.profiles set timezone = 'Asia/Kolkata'
   where id = '00000000-0000-0000-0000-0000000000a1';
end $$;

-- ================================================================ cross-user

do $$
begin
  begin
    insert into public.time_slots (user_id, slot_start, kind)
    values ('00000000-0000-0000-0000-0000000000b2',
            '2026-03-10 12:00:00+05:30', 'actual');
    raise exception 'a slot was written against another user';
  exception when insufficient_privilege then
    raise notice 'PASS 29  a slot cannot be written for another user';
  end;
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
declare v_n int;
begin
  -- Acceptance criterion 3: a second user's JWT reads zero rows from time_slots.
  select count(*) into v_n from public.time_slots;
  assert v_n = 0, format('user B saw %s of user A''s slots', v_n);
  raise notice 'PASS 31  user B reads zero rows from time_slots';
end $$;

do $$
declare v_n int; r record;
begin
  /*
   * The functions are security invoker, so B running them sees B's own empty
   * ledger rather than A's day. A security definer function here would have
   * leaked the lot while every table policy stayed perfectly correct.
   */
  select count(*) into v_n
  from public.get_day_grid('2026-03-10', '00000000-0000-0000-0000-0000000000a1');
  assert v_n = 0,
    format('user B pulled %s grid rows for user A''s day', v_n);

  select * into r from public.day_coverage('2026-03-10', '00000000-0000-0000-0000-0000000000a1');
  assert r.logged = 0 and r.expected = 0,
    format('user B read %s/%s of user A''s coverage', r.logged, r.expected);
  raise notice 'PASS 32  passing another user''s id to the metrics returns nothing';
end $$;

do $$
declare v_hours numeric;
begin
  v_hours := public.goal_own_hours('a0000000-0000-0000-0000-00000000000a');
  -- The effort rollup reads time_slots through the same policies, so it cannot
  -- be used as an oracle for another user's hours.
  assert v_hours = 0, format('user B read %s hours off user A''s goal', v_hours);
  raise notice 'PASS 33  goal_own_hours leaks no hours across users';
end $$;

reset role;
