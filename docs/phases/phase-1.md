# Phase 1 — Goal graph

**Self-contained brief.** Paste this into a fresh session with "continue the
build" and it has everything needed. Read `AGENTS.md` for the hard rules first.

## Why this comes first

Every other module attaches here. The time ledger (Phase 2) links each 15-minute
slot to a goal; the dashboard (Phase 3) is almost entirely rollups over this
graph. Getting the edge semantics wrong now means rewriting everything above it.

## The model in one paragraph

Goals form a **directed acyclic graph**. One table covers all six horizons
(`day → week → month → quarter → year → decade`); a "task" is just
`horizon = 'day'`. Edges are typed: `contributes_to` (vertical, carries weight
and an optional unit conversion), `depends_on` (blocking, any horizon),
`relates_to` (navigation only). **Effort in hours rolls up the entire chain
exactly. Outcome quantities roll up only one or two hops, and only across edges
with declared adjacent units** — long-horizon outcomes are entered directly by
the user, never derived. See `docs/DECISIONS.md` 001–006 for the reasoning; do
not relitigate it here.

## Do this first

Resolve the hand-written types file. Create a token at
https://supabase.com/dashboard/account/tokens, add `SUPABASE_ACCESS_TOKEN` to
`.env.local`, run `npm run db:types`, and confirm the regenerated file still
compiles. Every subsequent step depends on accurate types.

## Migration

New file in `supabase/migrations/`. Append-only — do not edit `20260816120000_init.sql`.

```sql
create type public.goal_horizon as enum
  ('day','week','month','quarter','year','decade');
create type public.goal_status as enum
  ('active','done','abandoned','blocked');
create type public.goal_link_type as enum
  ('contributes_to','depends_on','relates_to');

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  horizon public.goal_horizon not null,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  color public.notion_color not null default 'gray',
  metric_unit text,                    -- 'emails', 'replies', 'clients', 'INR'
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
  )
);

create table public.goal_links (
  parent_id uuid not null references public.goals on delete cascade,
  child_id  uuid not null references public.goals on delete cascade,
  user_id   uuid not null references auth.users on delete cascade,
  link_type public.goal_link_type not null,
  contribution_weight numeric not null default 1.0
    check (contribution_weight > 0 and contribution_weight <= 1.0),
  conversion_factor numeric check (conversion_factor > 0),
  conversion_note text,
  created_at timestamptz not null default now(),
  primary key (parent_id, child_id, link_type),
  constraint no_self_link check (parent_id <> child_id)
);

create table public.goal_revisions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  field text not null,               -- 'target_value' | 'due_date' | 'status'
  old_value text,
  new_value text,
  reason text,
  changed_at timestamptz not null default now()
);

create table public.goal_progress (
  goal_id uuid not null references public.goals on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  date date not null,
  value numeric not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (goal_id, date)
);
```

RLS + owner policies + `updated_at` triggers on all four. Follow the patterns in
the Phase 0 migration exactly, including `(select auth.uid())` in policies.

## The two triggers that carry the system

**Acyclicity.** Before insert/update on `goal_links`, walk ancestors of
`parent_id` via recursive CTE; if `child_id` appears, raise. A cycle makes the
effort rollup non-terminating — this is a correctness requirement, not a nicety.
Apply to `contributes_to` and `depends_on`; `relates_to` may cycle harmlessly.

**Weight sum.** After insert/update, verify the child's outgoing
`contributes_to` weights total ≤ 1.0, else raise. Without this, a task linked to
two parents contributes fully to each and every ancestor total silently inflates.

## Functions

```
goal_effort_rollup(p_goal_id uuid) returns numeric
  -- own logged hours + Σ (child effort × weight)
  -- Phase 1: own hours are 0 (no time_slots yet). Write it so Phase 2 only
  -- has to supply the leaf term — do not stub the recursion.

goal_outcome_rollup(p_goal_id uuid, p_max_depth int default 2)
  -- Sums child progress across contributes_to edges, applying conversion_factor.
  -- MUST refuse to traverse an edge whose units differ and whose
  -- conversion_factor is null. Returning a number there would be a fabricated
  -- metric — return the value and a flag saying the subtree was not summed.

goal_pace(p_goal_id uuid, p_as_of date)
  -- required_rate = (target - progress_at(as_of)) / days_remaining
  -- achieved_rate = EWMA of daily progress, half-life from profiles
  -- pace_ratio    = required / achieved
  -- Target and deadline MUST come from the revision active at p_as_of, not
  -- from the goals row as it stands today.

blocked_goals()      -- goals with incomplete depends_on dependencies
critical_path(uuid)  -- longest depends_on chain; flags impossible deadlines
```

## UI

Route group `src/app/(app)/goals/`. Add `/goals` to `BUILT` in
`src/components/layout/sidebar.tsx`.

- **Horizon columns** — six columns or a horizon switcher, listing active goals.
- **Goal detail** — targets, progress entry, links in and out, revision history.
- **Ancestry visualiser** — the headline feature. Given any task, render the
  full chain up to decade with the weight on each hop. This is the thing the
  whole model exists to make possible, so it should be the best-looking screen
  in the app.
- **Link editor** — pick parent, type, weight, conversion factor + note. Show
  the child's remaining weight budget (`1.0 − Σ existing`) so an over-allocation
  is obvious before submitting rather than as a database error.
- **Revision prompt** — editing a target or deadline asks for an optional reason
  and writes `goal_revisions`.

## Tests

`src/lib/metrics/` with Vitest, hand-computed fixtures:

- EWMA — verify `α = 1 − 2^(−1/h)` and a known series by hand.
- Pace ratio — including `achieved_rate = 0` (must not divide by zero) and
  `days_remaining = 0`.
- Weighted rollup — a **diamond** (A→B→D, A→C→D) with weights 0.5/0.5 must
  attribute A's effort exactly once at D. This is the test that proves the
  weight rule works; do not skip it.

pgTAP or SQL assertions:

- inserting a cycle raises
- weights summing >1.0 raise
- deep chains (10+ levels) terminate
- editing a decade target leaves `goal_pace(..., past_date)` unchanged

## Acceptance

1. `npm run build` passes.
2. All tests above pass.
3. RLS verified: a second user's JWT reads zero rows from all four tables.
4. The ancestry visualiser renders a real chain end to end — e.g. *cold email 20
   people* → *get 50 replies* → *land 10 clients* → *₹50L revenue* → *₹X net
   worth* — with weights shown and the undeclared-conversion boundary marked
   rather than silently summed.
5. `STATUS.md` updated, `docs/phases/phase-2.md` written.
