-- Synapse — corrects the EWMA inside goal_pace
--
-- 20260817090000 computed achieved_rate recursively, seeding the average with
-- the first observation. That gives the first day of a series a weight of 1
-- while every later day is weighted α, and on the short series this app actually
-- has — a week-horizon goal has seven points — the seed never decays out.
--
-- The consequence was a metric that ran backwards. With a three-day half-life,
-- ten emails sent three days ago reported 6.3/day, while the same ten emails
-- sent today reported 2.1/day. A user who stopped working looked faster than one
-- who had just started, and achieved_rate feeds pace_ratio, which feeds both the
-- dashboard and the nudge engine.
--
-- Replaced with the bias-corrected form: a properly normalised weighted mean,
-- where each day's weight is (1−α) raised to its age in days and the whole thing
-- is divided by the sum of those weights. The most recent day always carries the
-- greatest weight, a constant series returns that constant exactly, and the
-- half-life keeps the meaning it advertises.
--
-- Migrations are append-only; this replaces the function body rather than
-- editing the migration that introduced it.

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
  v_decay     numeric;
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

  /*
   * Bias-corrected EWMA over a densified daily series. The gaps must be real
   * zeros: a goal touched once a fortnight has a low rate, not a high one with
   * missing days. Dividing by the sum of weights is what keeps a day's influence
   * proportional to its age rather than to its position in the series.
   */
  if v_has_rows then
    v_alpha := 1 - power(2.0, -1.0 / v_half_life);
    v_decay := 1 - v_alpha;

    select sum(t.v * t.w) / nullif(sum(t.w), 0)
      into v_achieved
      from (
        select coalesce(p.value, 0) as v,
               power(v_decay, (p_as_of - d::date)) as w
          from generate_series(v_goal.start_date, p_as_of, interval '1 day') d
          left join public.goal_progress p
            on p.goal_id = p_goal_id and p.date = d::date
      ) t;
  end if;

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
  'Required versus achieved rate as of any date, evaluated against the target and deadline in effect on that date. achieved_rate is a bias-corrected EWMA over a densified daily series.';
