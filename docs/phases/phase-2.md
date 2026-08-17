# Phase 2 — The time ledger

**Self-contained brief.** Paste this into a fresh session with "continue the
build" and it has everything needed. Read `AGENTS.md` for the hard rules first,
then `STATUS.md` for where things actually stand.

## Why this comes next

Phase 1 built the goal graph and every effort rollup in it currently returns
zero, because nothing logs time yet. This phase supplies the missing leaf term.
The dashboard in Phase 3 is almost entirely rollups over the two together.

## The one-line summary of what changes upstream

```sql
create or replace function public.goal_own_hours(p_goal_id uuid)
returns numeric language sql stable as $$
  select coalesce(count(*) * 0.25, 0)   -- 15 minutes per slot
  from public.time_slots
  where goal_id = p_goal_id and kind = 'actual';
$$;
```

That is the entire integration. `goal_effort_shares` and `goal_effort_rollup`
were written for real in Phase 1 — path-wise weight accumulation, unbounded
depth, diamond-correct — and do not change. Do not rewrite the recursion; if the
rollup looks wrong after this phase, the bug is in `time_slots` or in the
function above, not in the graph.

Re-run `npm run db:test` after replacing it: assertion 12 currently asserts the
rollup is 0 and will need updating to a real figure, and that is the point at
which you find out whether the wiring works.

## The model in one paragraph

A day is 96 slots of 15 minutes. Slots are stored **sparsely** — only the ones
you actually filled — and read **densely**, with `get_day_grid(date)` projecting
the stored rows onto a full grid so the UI never has to reason about gaps. Each
slot optionally links to a `goal_id` at any horizon and to a `category_id`. Two
kinds of slot coexist for the same instant: `planned` (written the night before)
and `actual` (reconciled at day close). Their divergence is the planning-bias
metric, so both must be kept — overwriting the plan with what happened destroys
the only number that measures how well you predict yourself.

## Hard constraints

- **Slot times are UTC and 900-second aligned.**
  `extract(epoch from slot_start)::bigint % 900 = 0` is a database check
  constraint, not a convention. Local time exists only for display and for
  projecting the waking window.
- `primary key (user_id, slot_start, kind)` — one planned and one actual slot per
  instant, never two of a kind.
- RLS on every new table, in the same migration, with `(select auth.uid())`.
- The waking window from `profiles` is the **denominator of coverage**. Time
  outside it is excluded, not counted as a gap. Overnight windows are
  deliberately unsupported; see `docs/SCHEMA.md`.

## Migration

New file in `supabase/migrations/`. Append-only — do not edit either Phase 1
migration.

```sql
create type public.slot_kind as enum ('planned', 'actual');

create table public.time_slots (
  user_id uuid not null references auth.users on delete cascade,
  slot_start timestamptz not null,
  kind public.slot_kind not null,

  goal_id uuid,
  category_id uuid references public.categories on delete set null,
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, slot_start, kind),

  constraint slot_aligned check (
    extract(epoch from slot_start)::bigint % 900 = 0
  ),

  -- Same composite-key trick as Phase 1: proves the goal is the slot's owner's.
  constraint time_slots_goal_fkey
    foreign key (goal_id, user_id) references public.goals (id, user_id)
    on delete set null
);
```

Note `on delete set null` rather than cascade: deleting a goal must not delete
the record that time was spent. Index `(user_id, slot_start)` and
`(goal_id) where goal_id is not null`.

## Functions

```
get_day_grid(p_date date)
  -- 96 rows for the user's local day, dense, both kinds joined side by side.
  -- Projects UTC instants onto the local day using profiles.timezone.

day_coverage(p_date date)      -- logged slots / slots in the waking window
day_fidelity(p_date date)      -- planned slots whose actual matched
planning_bias(p_from, p_to)    -- per category: planned hours vs actual hours
```

All four are SQL. `day_coverage` and `day_fidelity` are the two the Phase 3
dashboard and the Phase 5 nudge engine both read, so they must be defined once
here — see hard rule 1 and ADR 011.

Watch the denominator on `day_fidelity`: a day with no plan has fidelity of
*nothing*, not 100%. Return null and let the UI say so.

## UI

Route group `src/app/(app)/today/`. Add `/today` to `BUILT` in
`src/components/layout/sidebar.tsx`.

- **The grid** — 96 rows, keyboard-navigable, drag to fill a range. This is the
  screen that gets used every day, so it has to be fast and it has to work
  without the mouse.
- **Plan mode / actual mode** — one toggle, same grid.
- **Day close** — the evening ritual: show planned beside actual, fill the gaps,
  and surface the day's coverage and fidelity once at the end rather than
  nagging live.
- **Goal picker** — reuse the pattern from the Phase 1 link editor.

## Tests

Vitest, against hand-computed fixtures, in `src/lib/metrics/`:

- Slot alignment maths across a DST boundary — pick a timezone that has one, even
  though `Asia/Kolkata` does not, because the function must not assume otherwise.
- Coverage with a partially filled waking window.
- Fidelity when nothing was planned (must be null, not 1.0 and not 0).

SQL assertions appended to a new `supabase/tests/phase-2.sql`, run by the
existing `npm run db:test` (pass the file as an argument):

- an unaligned `slot_start` raises
- a slot referencing another user's goal raises
- `get_day_grid` returns exactly 96 rows for a day with three slots stored
- `goal_effort_rollup` returns real hours once slots exist, and the Phase 1
  diamond still attributes them exactly once

## Acceptance

1. `npm run build` passes.
2. `npm run test` and `npm run db:test` pass, including the updated assertion 12.
3. RLS verified: a second user's JWT reads zero rows from `time_slots`.
4. A day can be planned, lived and closed entirely from `/today`.
5. `goal_effort_rollup` on the seeded chain returns a non-zero, hand-checkable
   number, and the ancestry visualiser shows it.
6. `STATUS.md` updated, `docs/phases/phase-3.md` written.

## Things that will bite you

- Run everything from `D:\Portfolio\synapse` (lowercase). See the casing entry in
  `STATUS.md` — building from the wrong casing fails with an invariant error that
  looks like a Next.js bug.
- `npm run typecheck` fails on a cold checkout until `npm run build` has run once,
  because `PageProps`/`LayoutProps` are generated.
- Do not name any module inside a route directory `layout.ts`; Next treats it as
  a route layout. Phase 1 hit this and the file is `graph-layout.ts`.
- Postgres does not record NOT NULL on view columns, so generated view types come
  out fully nullable. Phase 1 handles this with narrowed aliases in
  `src/lib/supabase/types.ts` — follow that pattern rather than scattering `!`.
