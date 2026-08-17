-- Synapse — Phase 1 assertions
--
-- Run with `npm run db:test`. Everything here executes inside a transaction the
-- runner always rolls back, so it is safe against the real database.
--
-- Most assertions run as a real `authenticated` identity rather than as postgres.
-- That matters: every function here is security invoker, so running them as a
-- superuser would bypass RLS and never exercise the path the app actually takes.
--
-- Each passing assertion raises a notice beginning PASS; the runner counts them.

-- ---------------------------------------------------------------- fixtures

-- Two users. Only postgres can write auth.users, so this happens before the
-- identity switch. The handle_new_user trigger seeds profiles and categories.
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'a@synapse.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@synapse.test');

-- One goal belonging to B, created here as postgres so it already exists while
-- acting as A. Without it the cross-user assertion below would pass for the
-- wrong reason: a missing row also violates the foreign key.
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

-- The EWMA fixture below is hand-computed against a one-day half-life, which
-- makes every weight an exact binary fraction.
update public.profiles set ewma_half_life_days = 1
where id = '00000000-0000-0000-0000-0000000000a1';

-- Diamond:  D ──1.0──> B ──0.5──> A
--           D ──1.0──> C ──0.5──> A
-- (parent ──weight──> child; weight is the share of the CHILD's effort)
insert into public.goals (id, user_id, horizon, title, start_date, due_date)
values
  ('d0000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000a1', 'decade',  'D top',   '2026-01-01', '2036-01-01'),
  ('b0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 'year',    'B middle','2026-01-01', '2026-12-31'),
  ('c0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1', 'year',    'C middle','2026-01-01', '2026-12-31'),
  ('a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'day',     'A leaf',  '2026-01-01', '2026-01-01');

insert into public.goal_links (parent_id, child_id, user_id, link_type, contribution_weight)
values
  ('d0000000-0000-0000-0000-00000000000d', 'b0000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 1.0),
  ('d0000000-0000-0000-0000-00000000000d', 'c0000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 1.0),
  ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 0.5),
  ('c0000000-0000-0000-0000-00000000000c', 'a0000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 0.5);

-- ================================================================ constraints

do $$
begin
  /*
   * Two mechanisms cover self-links, and which one fires depends on the type.
   * BEFORE ROW triggers run ahead of check constraints, so on a traversable edge
   * the acyclicity trigger gets there first and reports it as the cycle it is.
   * relates_to returns early from that trigger, leaving no_self_link to catch it.
   */
  begin
    insert into public.goal_links (parent_id, child_id, user_id, link_type)
    values ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a',
            '00000000-0000-0000-0000-0000000000a1', 'contributes_to');
    raise exception 'a contributes_to self-link was accepted';
  exception when sqlstate 'SY001' then
    raise notice 'PASS 01a contributes_to self-link rejected as a cycle';
  end;

  begin
    insert into public.goal_links (parent_id, child_id, user_id, link_type)
    values ('a0000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-00000000000a',
            '00000000-0000-0000-0000-0000000000a1', 'relates_to');
    raise exception 'a relates_to self-link was accepted';
  exception when check_violation then
    raise notice 'PASS 01b relates_to self-link rejected by no_self_link';
  end;
end $$;

do $$
begin
  begin
    -- A already traces up to D, so D -> ... -> A -> D would close a loop.
    insert into public.goal_links (parent_id, child_id, user_id, link_type)
    values ('a0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000d',
            '00000000-0000-0000-0000-0000000000a1', 'contributes_to');
    raise exception 'a contributes_to cycle was accepted';
  exception when sqlstate 'SY001' then
    raise notice 'PASS 02  contributes_to cycle rejected (SY001)';
  end;
end $$;

do $$
begin
  insert into public.goal_links (parent_id, child_id, user_id, link_type)
  values ('b0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000c',
          '00000000-0000-0000-0000-0000000000a1', 'depends_on');
  begin
    insert into public.goal_links (parent_id, child_id, user_id, link_type)
    values ('c0000000-0000-0000-0000-00000000000c', 'b0000000-0000-0000-0000-00000000000b',
            '00000000-0000-0000-0000-0000000000a1', 'depends_on');
    raise exception 'a depends_on cycle was accepted';
  exception when sqlstate 'SY001' then
    raise notice 'PASS 03  depends_on cycle rejected (SY001)';
  end;
end $$;

do $$
begin
  -- relates_to carries no maths, so a loop there is harmless and allowed.
  insert into public.goal_links (parent_id, child_id, user_id, link_type)
  values ('b0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000c',
          '00000000-0000-0000-0000-0000000000a1', 'relates_to'),
         ('c0000000-0000-0000-0000-00000000000c', 'b0000000-0000-0000-0000-00000000000b',
          '00000000-0000-0000-0000-0000000000a1', 'relates_to');
  raise notice 'PASS 04  relates_to may cycle';
end $$;

do $$
begin
  begin
    -- A's outgoing contributes_to weights already total exactly 1.0.
    insert into public.goal_links (parent_id, child_id, user_id, link_type, contribution_weight)
    values ('d0000000-0000-0000-0000-00000000000d', 'a0000000-0000-0000-0000-00000000000a',
            '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 0.1);
    raise exception 'an over-allocation was accepted';
  exception when sqlstate 'SY002' then
    raise notice 'PASS 05  weight budget over 1.0 rejected (SY002)';
  end;
end $$;

do $$
declare v_total numeric;
begin
  select sum(contribution_weight) into v_total
  from public.goal_links
  where child_id = 'a0000000-0000-0000-0000-00000000000a'
    and link_type = 'contributes_to';
  -- numeric is exact decimal; this is why the column is not double precision.
  assert v_total = 1.0, format('0.5 + 0.5 came to %s', v_total);
  raise notice 'PASS 06  0.5 + 0.5 is exactly 1.0 and accepted';
end $$;

do $$
begin
  begin
    insert into public.goals (user_id, horizon, title, start_date, due_date, metric_unit)
    values ('00000000-0000-0000-0000-0000000000a1', 'week', 'unit without target',
            '2026-01-01', '2026-01-07', 'emails');
    raise exception 'a unit without a target was accepted';
  exception when check_violation then
    raise notice 'PASS 07  goal_metric_paired enforced';
  end;
end $$;

do $$
begin
  begin
    insert into public.goals (user_id, horizon, title, start_date, due_date)
    values ('00000000-0000-0000-0000-0000000000a1', 'week', 'backwards',
            '2026-02-01', '2026-01-01');
    raise exception 'a goal due before it starts was accepted';
  exception when check_violation then
    raise notice 'PASS 08  goal_dates_valid enforced';
  end;
end $$;

do $$
begin
  begin
    insert into public.goal_links (parent_id, child_id, user_id, link_type, conversion_factor)
    values ('d0000000-0000-0000-0000-00000000000d', 'b0000000-0000-0000-0000-00000000000b',
            '00000000-0000-0000-0000-0000000000a1', 'depends_on', 2.0);
    raise exception 'a conversion factor on a depends_on edge was accepted';
  exception when check_violation then
    raise notice 'PASS 09  conversion_only_on_contribution enforced';
  end;
end $$;

-- ---------------------------------------------------------------- deep chain

do $$
declare
  v_prev uuid;
  v_id   uuid;
  i      int;
begin
  v_prev := null;
  for i in 1..12 loop
    insert into public.goals (user_id, horizon, title, start_date, due_date)
    values ('00000000-0000-0000-0000-0000000000a1', 'week', 'chain ' || i,
            '2026-01-01', '2026-12-31')
    returning id into v_id;

    if v_prev is not null then
      insert into public.goal_links (parent_id, child_id, user_id, link_type, contribution_weight)
      values (v_prev, v_id, '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 1.0);
    end if;
    v_prev := v_id;
  end loop;

  -- The top of the chain is 11 hops above the bottom; this must terminate.
  perform public.goal_effort_rollup(
    (select id from public.goals where title = 'chain 1'));
  assert (select count(*) from public.goal_effort_shares(
            (select id from public.goals where title = 'chain 1'))) = 12,
    'deep chain did not yield 12 shares';
  raise notice 'PASS 10  12-level chain terminates';
end $$;

-- ================================================================ effort rollup

do $$
declare v_share numeric;
begin
  select share into v_share
  from public.goal_effort_shares('d0000000-0000-0000-0000-00000000000d')
  where goal_id = 'a0000000-0000-0000-0000-00000000000a';

  /*
   * The diamond. A is reached from D twice — once through B at 1.0 x 0.5 and
   * once through C at 1.0 x 0.5 — and the two paths sum to exactly 1.0. This is
   * the assertion that proves effort is attributed once rather than halved
   * (visited-set dedup) or doubled (no weights).
   */
  assert v_share = 1.0, format('diamond leaf share was %s, expected 1.0', v_share);
  raise notice 'PASS 11  diamond attributes the leaf exactly once (share = 1.0)';
end $$;

do $$
begin
  -- Nothing has been logged yet, so the rollup is honestly zero rather than
  -- absent. This half of the assertion held throughout Phase 1.
  assert public.goal_effort_rollup('d0000000-0000-0000-0000-00000000000d') = 0,
    'effort rollup was non-zero before any time is logged';
  raise notice 'PASS 12a effort rollup is 0 while nothing is logged';
end $$;

do $$
declare v_roll numeric;
begin
  /*
   * Phase 2 wired goal_own_hours() to the time ledger, and this is where that
   * wiring is exercised from the Phase 1 side: the recursion below has not
   * changed by a character, so a wrong figure here is a bug in time_slots or in
   * goal_own_hours, never in the graph.
   *
   * Six actual quarter hours against the leaf is 1.5 h. The four PLANNED slots
   * are logged against the same goal deliberately and must not appear in the
   * total — intent is not effort.
   */
  insert into public.time_slots (user_id, slot_start, kind, goal_id)
  select '00000000-0000-0000-0000-0000000000a1', s, 'actual',
         'a0000000-0000-0000-0000-00000000000a'
  from generate_series('2026-01-01 09:00:00+05:30'::timestamptz,
                       '2026-01-01 10:15:00+05:30'::timestamptz,
                       interval '15 minutes') s;

  insert into public.time_slots (user_id, slot_start, kind, goal_id)
  select '00000000-0000-0000-0000-0000000000a1', s, 'planned',
         'a0000000-0000-0000-0000-00000000000a'
  from generate_series('2026-01-01 14:00:00+05:30'::timestamptz,
                       '2026-01-01 14:45:00+05:30'::timestamptz,
                       interval '15 minutes') s;

  assert public.goal_own_hours('a0000000-0000-0000-0000-00000000000a') = 1.5,
    format('own hours were %s, expected 1.5',
           public.goal_own_hours('a0000000-0000-0000-0000-00000000000a'));

  v_roll := public.goal_effort_rollup('d0000000-0000-0000-0000-00000000000d');

  -- 1.5 h reaching the top through both arms of the diamond at 0.5 each: a
  -- share of exactly 1.0. Not 0.75 (dedup) and not 3.0 (unweighted).
  assert v_roll = 1.5, format('the rollup at D was %s, expected 1.5', v_roll);
  raise notice 'PASS 12b logged time rolls up the diamond exactly once (1.5 h)';
end $$;

-- ================================================================ outcome rollup

do $$
declare
  v_parent uuid;
  v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; v_gc uuid;
  v_val numeric; v_complete boolean; v_unsummed jsonb;
begin
  insert into public.goals (user_id, horizon, title, start_date, due_date, metric_unit, target_value)
  values ('00000000-0000-0000-0000-0000000000a1', 'month', 'O parent', '2026-01-01', '2026-01-31', 'replies', 50)
  returning id into v_parent;

  -- emails -> replies with a declared conversion: 100 x 0.05 = 5
  insert into public.goals (user_id, horizon, title, start_date, due_date, metric_unit, target_value)
  values ('00000000-0000-0000-0000-0000000000a1', 'week', 'O emails', '2026-01-01', '2026-01-07', 'emails', 100)
  returning id into v_c1;

  -- same unit, no conversion needed: 3
  insert into public.goals (user_id, horizon, title, start_date, due_date, metric_unit, target_value)
  values ('00000000-0000-0000-0000-0000000000a1', 'week', 'O replies', '2026-01-01', '2026-01-07', 'replies', 10)
  returning id into v_c2;

  -- units differ and no conversion is declared: must be refused, not guessed
  insert into public.goals (user_id, horizon, title, start_date, due_date, metric_unit, target_value)
  values ('00000000-0000-0000-0000-0000000000a1', 'week', 'O clients', '2026-01-01', '2026-01-07', 'clients', 2)
  returning id into v_c3;

  -- no unit at all
  insert into public.goals (user_id, horizon, title, start_date, due_date)
  values ('00000000-0000-0000-0000-0000000000a1', 'week', 'O unmeasured', '2026-01-01', '2026-01-07')
  returning id into v_c4;

  insert into public.goal_links (parent_id, child_id, user_id, link_type, contribution_weight, conversion_factor)
  values (v_parent, v_c1, '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 1.0, 0.05),
         (v_parent, v_c2, '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 1.0, null),
         (v_parent, v_c3, '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 1.0, null),
         (v_parent, v_c4, '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 1.0, null);

  insert into public.goal_progress (goal_id, user_id, date, value)
  values (v_c1, '00000000-0000-0000-0000-0000000000a1', '2026-01-05', 100),
         (v_c2, '00000000-0000-0000-0000-0000000000a1', '2026-01-05', 3),
         (v_c3, '00000000-0000-0000-0000-0000000000a1', '2026-01-05', 1);

  select value, is_complete, unsummed
    into v_val, v_complete, v_unsummed
    from public.goal_outcome_rollup(v_parent);

  assert v_val = 8, format('outcome value was %s, expected 8', v_val);
  raise notice 'PASS 13  outcome sums declared conversions only (100x0.05 + 3 = 8)';

  assert not v_complete, 'outcome claimed completeness despite a refused edge';
  raise notice 'PASS 14  outcome reports itself incomplete';

  assert v_unsummed @> '[{"reason":"unit_mismatch"}]'::jsonb,
    format('expected a unit_mismatch entry, got %s', v_unsummed);
  raise notice 'PASS 15  undeclared unit boundary reported as unit_mismatch';

  assert v_unsummed @> '[{"reason":"child_unmeasured"}]'::jsonb,
    format('expected a child_unmeasured entry, got %s', v_unsummed);
  raise notice 'PASS 16  unmeasured child reported rather than dropped';

  -- A grandchild in the same unit, beyond the depth limit.
  insert into public.goals (user_id, horizon, title, start_date, due_date, metric_unit, target_value)
  values ('00000000-0000-0000-0000-0000000000a1', 'day', 'O grandchild', '2026-01-01', '2026-01-01', 'replies', 5)
  returning id into v_gc;

  insert into public.goal_links (parent_id, child_id, user_id, link_type, contribution_weight)
  values (v_c2, v_gc, '00000000-0000-0000-0000-0000000000a1', 'contributes_to', 1.0);

  select unsummed into v_unsummed
    from public.goal_outcome_rollup(v_parent, 1);

  assert v_unsummed @> '[{"reason":"depth_limit"}]'::jsonb,
    format('expected a depth_limit entry at max_depth 1, got %s', v_unsummed);
  raise notice 'PASS 17  depth limit reported as depth_limit';
end $$;

-- ================================================================ pace

do $$
declare
  v_goal uuid;
  r record;
begin
  insert into public.goals (id, user_id, horizon, title, start_date, due_date, metric_unit, target_value)
  values ('e0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-0000000000a1',
          'month', 'P ewma', '2026-03-01', '2026-03-21', 'emails', 100)
  returning id into v_goal;

  insert into public.goal_progress (goal_id, user_id, date, value)
  values (v_goal, '00000000-0000-0000-0000-0000000000a1', '2026-03-01', 4),
         (v_goal, '00000000-0000-0000-0000-0000000000a1', '2026-03-02', 1);

  select * into r from public.goal_pace(v_goal, '2026-03-02');

  /*
   * Half-life 1 day, so (1 - alpha) = 0.5 and the weights are 0.5 and 1.
   *   weighted = 0.5*4 + 1*1 = 3
   *   weights  = 0.5   + 1   = 1.5
   *   achieved = 2
   * Exact on purpose, and the same fixture the TypeScript mirror in
   * src/lib/metrics/ewma.ts is tested against.
   */
  assert r.achieved_rate = 2, format('EWMA was %s, expected 2', r.achieved_rate);
  raise notice 'PASS 18  bias-corrected EWMA is exactly 2.0';

  -- The property the correction exists for: the recent, smaller observation must
  -- not be outranked by the older, larger one.
  assert r.achieved_rate < 4 and r.achieved_rate > 1,
    format('EWMA %s fell outside the observations it averages', r.achieved_rate);

  assert r.progress_to_date = 5, format('progress was %s', r.progress_to_date);
  assert r.remaining = 95, format('remaining was %s', r.remaining);
  assert r.days_remaining = 19, format('days_remaining was %s', r.days_remaining);
  assert r.required_rate = 5, format('required_rate was %s', r.required_rate);
  assert r.pace_ratio = 2.5, format('pace_ratio was %s', r.pace_ratio);
  assert r.status = 'behind', format('status was %s', r.status);
  raise notice 'PASS 19  required 5/day, achieved 2/day, ratio 2.5, behind';
end $$;

do $$
declare
  v_goal uuid;
  r record;
begin
  insert into public.goals (user_id, horizon, title, start_date, due_date, metric_unit, target_value)
  values ('00000000-0000-0000-0000-0000000000a1', 'month', 'P nodata', '2026-03-01', '2026-03-31', 'emails', 100)
  returning id into v_goal;

  select * into r from public.goal_pace(v_goal, '2026-03-03');

  -- A silent zero here would be indistinguishable from a true zero.
  assert r.achieved_rate is null, format('achieved_rate was %s, expected null', r.achieved_rate);
  assert r.status = 'no_data', format('status was %s', r.status);
  raise notice 'PASS 20  no progress yields null achieved_rate and no_data';
end $$;

do $$
declare
  v_goal uuid;
  r record;
begin
  insert into public.goals (user_id, horizon, title, start_date, due_date, metric_unit, target_value)
  values ('00000000-0000-0000-0000-0000000000a1', 'month', 'P overdue', '2026-03-01', '2026-03-03', 'emails', 100)
  returning id into v_goal;
  insert into public.goal_progress (goal_id, user_id, date, value)
  values (v_goal, '00000000-0000-0000-0000-0000000000a1', '2026-03-01', 10);

  select * into r from public.goal_pace(v_goal, '2026-03-03');

  assert r.days_remaining = 0, format('days_remaining was %s', r.days_remaining);
  assert r.required_rate is null, 'required_rate divided by zero days';
  assert r.status = 'overdue', format('status was %s', r.status);
  raise notice 'PASS 21  zero days remaining yields overdue, no division';
end $$;

do $$
declare
  v_goal uuid;
  r record;
begin
  insert into public.goals (user_id, horizon, title, start_date, due_date, metric_unit, target_value)
  values ('00000000-0000-0000-0000-0000000000a1', 'month', 'P stalled', '2026-03-01', '2026-03-31', 'emails', 100)
  returning id into v_goal;
  -- Logged long enough ago that the EWMA has decayed to zero.
  insert into public.goal_progress (goal_id, user_id, date, value)
  values (v_goal, '00000000-0000-0000-0000-0000000000a1', '2026-03-01', 0);

  select * into r from public.goal_pace(v_goal, '2026-03-10');

  assert r.achieved_rate = 0, format('achieved_rate was %s', r.achieved_rate);
  assert r.pace_ratio is null, 'pace_ratio divided by a zero achieved rate';
  assert r.status = 'stalled', format('status was %s', r.status);
  raise notice 'PASS 22  zero achieved rate yields stalled, no division';
end $$;

do $$
declare
  v_goal uuid;
  r record;
begin
  insert into public.goals (user_id, horizon, title, start_date, due_date, metric_unit, target_value)
  values ('00000000-0000-0000-0000-0000000000a1', 'month', 'P complete', '2026-03-01', '2026-03-31', 'emails', 10)
  returning id into v_goal;
  insert into public.goal_progress (goal_id, user_id, date, value)
  values (v_goal, '00000000-0000-0000-0000-0000000000a1', '2026-03-01', 12);

  select * into r from public.goal_pace(v_goal, '2026-03-03');
  assert r.status = 'complete', format('status was %s', r.status);
  raise notice 'PASS 23  target met yields complete';
end $$;

do $$
declare
  v_goal uuid;
  r record;
begin
  insert into public.goals (user_id, horizon, title, start_date, due_date)
  values ('00000000-0000-0000-0000-0000000000a1', 'month', 'P unmeasured', '2026-03-01', '2026-03-31')
  returning id into v_goal;

  select * into r from public.goal_pace(v_goal, '2026-03-03');
  assert r.status = 'unmeasured', format('status was %s', r.status);
  assert r.required_rate is null and r.pace_ratio is null,
    'rates were computed for a goal with no target';
  raise notice 'PASS 24  no target yields unmeasured and no rates';
end $$;

-- ================================================================ revisions

do $$
declare
  before_row record;
  after_row  record;
begin
  select * into before_row from public.goal_pace('e0000000-0000-0000-0000-00000000000e', '2026-03-02');

  update public.goals set target_value = 500
  where id = 'e0000000-0000-0000-0000-00000000000e';

  select * into after_row from public.goal_pace('e0000000-0000-0000-0000-00000000000e', '2026-03-02');

  assert before_row = after_row,
    format('raising the target changed history: %s became %s', before_row, after_row);
  raise notice 'PASS 25  raising a target leaves past pace byte-identical';
end $$;

do $$
declare
  before_row record;
  after_row  record;
begin
  select * into before_row from public.goal_pace('e0000000-0000-0000-0000-00000000000e', '2026-03-02');

  update public.goals set due_date = '2027-01-01'
  where id = 'e0000000-0000-0000-0000-00000000000e';

  select * into after_row from public.goal_pace('e0000000-0000-0000-0000-00000000000e', '2026-03-02');

  assert before_row.due_date = after_row.due_date,
    format('moving the deadline changed the past: %s became %s',
           before_row.due_date, after_row.due_date);
  raise notice 'PASS 26  moving a deadline leaves past pace on the old date';
end $$;

do $$
declare
  v_goal uuid;
  r record;
begin
  -- A goal that had no target at all, then gained one. old_value is genuinely
  -- NULL here, and coalescing it to today's target would invent a target for a
  -- period that had none — the trap `if found` exists to avoid.
  insert into public.goals (user_id, horizon, title, start_date, due_date)
  values ('00000000-0000-0000-0000-0000000000a1', 'month', 'P latetarget', '2026-03-01', '2026-06-30')
  returning id into v_goal;

  perform public.update_goal_targets(v_goal, 'emails', 100, '2026-06-30', 'active', 'set a target at last');

  select * into r from public.goal_pace(v_goal, '2026-03-03');

  assert r.target_value is null,
    format('a target of %s leaked backwards into a period that had none', r.target_value);
  assert r.status = 'unmeasured', format('status was %s', r.status);
  raise notice 'PASS 27  a later-set target does not leak backwards (null old_value)';
end $$;

do $$
declare v_n int; v_reason text;
begin
  select count(*) into v_n
  from public.goal_revisions
  where goal_id = 'e0000000-0000-0000-0000-00000000000e';
  -- The two direct updates above, made without going through the RPC.
  assert v_n = 2, format('expected 2 revisions from direct updates, found %s', v_n);

  select reason into v_reason
  from public.goal_revisions
  where goal_id = 'e0000000-0000-0000-0000-00000000000e'
  limit 1;
  assert v_reason is null, 'a direct update somehow carried a reason';
  raise notice 'PASS 28  direct updates are logged too, with a null reason';
end $$;

do $$
declare v_reason text;
begin
  select reason into v_reason
  from public.goal_revisions r
  join public.goals g on g.id = r.goal_id
  where g.title = 'P latetarget' and r.field = 'target_value';

  assert v_reason = 'set a target at last',
    format('reason was %s', coalesce(v_reason, 'null'));
  raise notice 'PASS 29  update_goal_targets carries the reason into the log';
end $$;

do $$
begin
  begin
    insert into public.goal_revisions (goal_id, user_id, field, old_value, new_value)
    values ('e0000000-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-0000000000a1',
            'status', 'active', 'done');
    raise exception 'a revision was inserted directly';
  exception when insufficient_privilege then
    raise notice 'PASS 30  revisions cannot be inserted by hand';
  end;
end $$;

do $$
declare v_n int;
begin
  update public.goal_revisions set reason = 'rewriting history'
  where goal_id = 'e0000000-0000-0000-0000-00000000000e';
  get diagnostics v_n = row_count;
  assert v_n = 0, format('%s revision rows were updated', v_n);

  delete from public.goal_revisions
  where goal_id = 'e0000000-0000-0000-0000-00000000000e';
  get diagnostics v_n = row_count;
  assert v_n = 0, format('%s revision rows were deleted', v_n);
  raise notice 'PASS 31  revisions cannot be updated or deleted (append-only)';
end $$;

-- ================================================================ ancestry

do $$
declare v_n int; v_share numeric;
begin
  select count(*) into v_n
  from public.goal_ancestry('a0000000-0000-0000-0000-00000000000a');
  -- A -> B, A -> C, B -> D, C -> D
  assert v_n = 4, format('ancestry returned %s edges, expected 4', v_n);

  select sum(share) into v_share
  from public.goal_ancestry('a0000000-0000-0000-0000-00000000000a')
  where parent_id = 'd0000000-0000-0000-0000-00000000000d';
  assert v_share = 1.0, format('share reaching the top was %s, expected 1.0', v_share);
  raise notice 'PASS 32  ancestry walks the diamond and shares total 1.0 at the top';
end $$;

do $$
declare v_flag boolean;
begin
  select crosses_undeclared_conversion into v_flag
  from public.goal_ancestry(
    (select id from public.goals where title = 'O clients'))
  where parent_id = (select id from public.goals where title = 'O parent');

  assert v_flag, 'the clients -> replies hop was not flagged as undeclared';
  raise notice 'PASS 33  undeclared conversion boundary flagged for the visualiser';
end $$;

-- ================================================================ cross-user

do $$
declare v_bgoal uuid := 'f0000000-0000-0000-0000-00000000000f';
begin
  -- Created below as B; referencing it from A must fail on the composite key.
  begin
    insert into public.goal_links (parent_id, child_id, user_id, link_type)
    values (v_bgoal, 'a0000000-0000-0000-0000-00000000000a',
            '00000000-0000-0000-0000-0000000000a1', 'contributes_to');
    raise exception 'a link to another user''s goal was accepted';
  exception when foreign_key_violation then
    raise notice 'PASS 34  a link to a goal that is not yours is rejected';
  end;
end $$;

do $$
begin
  begin
    insert into public.goal_progress (goal_id, user_id, date, value)
    values ('a0000000-0000-0000-0000-00000000000a',
            '00000000-0000-0000-0000-0000000000b2', '2026-01-01', 5);
    raise exception 'progress was written against another user';
  exception when insufficient_privilege or foreign_key_violation then
    raise notice 'PASS 35  progress cannot be written for another user';
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
  raise notice 'PASS 36  identity resolves to user B';
end $$;

do $$
declare v_a_goals int; v_links int; v_progress int; v_revisions int;
begin
  -- Acceptance criterion 3: none of user A's rows are visible to user B.
  select count(*) into v_a_goals
    from public.goals where user_id = '00000000-0000-0000-0000-0000000000a1';
  select count(*) into v_links     from public.goal_links;
  select count(*) into v_progress  from public.goal_progress;
  select count(*) into v_revisions from public.goal_revisions;

  assert v_a_goals = 0,   format('user B saw %s of user A''s goals', v_a_goals);
  assert v_links = 0,     format('user B saw %s links', v_links);
  assert v_progress = 0,  format('user B saw %s progress rows', v_progress);
  assert v_revisions = 0, format('user B saw %s revisions', v_revisions);
  raise notice 'PASS 37  user B reads zero of user A''s rows from all four tables';
end $$;

do $$
declare v_overview int; v_budget int;
begin
  select count(*) into v_overview
    from public.goal_overview where user_id = '00000000-0000-0000-0000-0000000000a1';
  select count(*) into v_budget
    from public.goal_weight_budget where user_id = '00000000-0000-0000-0000-0000000000a1';

  /*
   * Not optional. A view created without security_invoker runs as its owner and
   * returns every user's rows while each underlying table policy remains
   * perfectly correct — the one mistake here that silently defeats all of them.
   */
  assert v_overview = 0, format('goal_overview leaked %s rows to user B', v_overview);
  assert v_budget = 0,   format('goal_weight_budget leaked %s rows to user B', v_budget);
  raise notice 'PASS 38  both views are security_invoker and leak nothing';
end $$;

do $$
declare v_n int;
begin
  -- Filtering, not just emptiness: B's own row is still there.
  select count(*) into v_n from public.goals;
  assert v_n = 1, format('user B saw %s goals, expected exactly their own', v_n);
  raise notice 'PASS 39  user B sees exactly their own goal';
end $$;

do $$
declare v_n int;
begin
  update public.goals set title = 'stolen'
  where id = 'd0000000-0000-0000-0000-00000000000d';
  -- RLS filters the row out rather than raising, so no effect is the assertion.
  get diagnostics v_n = row_count;
  assert v_n = 0, format('user B updated %s of user A''s goals', v_n);
  raise notice 'PASS 40  user B cannot modify user A''s goals';
end $$;

reset role;
