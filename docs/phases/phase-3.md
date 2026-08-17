# Phase 3 — The dashboard

**Self-contained brief.** Paste this into a fresh session with "continue the
build" and it has everything needed. Read `AGENTS.md` for the hard rules first,
then `STATUS.md` for where things actually stand.

## Why this comes next

Phases 1 and 2 built two halves of the same picture and left them in separate
rooms. The goal graph knows what you are trying to do and how fast you are moving
toward it; the ledger knows where the hours went. Neither is much use alone — the
graph without the ledger reports zero effort, and the ledger without the graph is
a colouring book.

This phase does almost no new modelling. Nearly every figure it renders already
exists as a Postgres function with tests behind it. The work is choosing what to
show, and — much harder — refusing to show what cannot be justified.

## The one thing this phase can get catastrophically wrong

A dashboard is a machine for making numbers look authoritative. Hard rule 8 says
never fabricate a metric in the UI, and this is the phase where the temptation is
constant and cheap: a sparkline with two points, a percentage over a denominator
of three, a trend line through noise, a gauge that reads 0% when it means
"unknown".

The existing SQL is already careful about this and returns null where a metric is
undefined — `day_fidelity` on an unplanned day, `goal_pace.pace_ratio` with a
zero achieved rate, `planning_bias.bias_ratio` for a category that was never
budgeted, `goal_outcome_rollup`'s refusal list. **Every one of those nulls must
survive to the screen as words, not as a zero and not as a blank cell.** The
generated types will not help you: Postgres records no nullability on a
function's OUT parameters, so they all arrive typed `number`. Use the narrowed
aliases in `src/lib/supabase/types.ts` at every query boundary.

If you render one number in this phase that you cannot trace to a SQL definition,
the phase has failed regardless of how it looks.

## What exists already

Read these before writing any query; you will otherwise reimplement three of them.

| Function | Returns | Null when |
|---|---|---|
| `day_coverage(date, user_id?)` | `logged, expected, coverage` | the waking window is empty |
| `day_fidelity(date, user_id?)` | `planned, honoured, fidelity` | **nothing was planned** |
| `planning_bias(from, to, user_id?)` | per category: planned/actual hours, bias, ratio | ratio, where nothing was budgeted |
| `get_day_grid(date, user_id?)` | 96 dense rows (92/100 across DST) | — |
| `goal_pace(goal_id, as_of)` | required/achieved rate, ratio, status | rates, in five of the eight statuses |
| `goal_effort_rollup(goal_id)` | weighted hours from the whole subtree | — |
| `goal_outcome_rollup(goal_id, depth)` | value, `is_complete`, `unsummed` | — (but `is_complete` is usually false) |
| `goal_ancestry(goal_id)` | every upward edge with accumulated share | — |
| `blocked_goals()` | goals with unfinished prerequisites | — |
| `critical_path(goal_id)` | longest prerequisite chain, deadline breaks flagged | — |

`goal_pace`'s eight statuses each have a sentence and a tone already written in
`src/app/(app)/goals/display.ts` (`PACE_SENTENCE`, `PACE_TONE`). Reuse them —
they exist so the wording of an undefined metric is decided once.

## What is new

Three things need SQL that does not exist yet. All three are metrics, so all
three are SQL — hard rule 1, ADR 011.

### `allocation(p_from, p_to)`

The third adherence number, and the only one of the three ADR 007 names that
Phase 2 did not build. Productive hours over logged hours, per category and in
total, using `categories.is_productive`.

Note what it is *not*: it is not a score. `is_productive` marks sleep as
productive on purpose. The metric answers "where did the hours go", and the UI
must not decorate it with a judgement the data does not carry.

### `adherence_series(p_from, p_to)`

Coverage and fidelity per day across a range, in one query. The dashboard needs a
trend and 30 round trips to `day_coverage` is not it.

Watch the fidelity column: days with no plan must come back null and must break
the line rather than being drawn as zero. A charting library will happily
interpolate straight through them — this is the single most likely place for this
phase to render a lie.

### `effort_outcome_series(p_goal_id, p_from, p_to)`

The divergence chart from ADR 004, which is the most valuable view in the whole
app and the reason the two rollups were kept separate: effort invested (exact,
from the ledger) against outcome achieved (measured, from `goal_progress`), as
two independent series on one time axis, **never combined into a percentage**.

High effort against a flat outcome means the strategy is wrong. No blended
completion figure would ever reveal that, which is exactly why none is computed.

## UI

Route `src/app/(app)/dashboard/` — the page exists as a stub and is already in
`BUILT` in `src/components/layout/sidebar.tsx`.

- **Today's three numbers** — coverage, fidelity, allocation. Each with its
  denominator visible beside it (`16 of 64 slots`), because a bare percentage is
  unauditable. Follow the card pattern in `today/day-close-dialog.tsx`.
- **The adherence trend** — 30 days, coverage and fidelity as separate lines,
  gaps where fidelity is undefined.
- **Goals needing attention** — `behind`, `overdue` and `stalled` from
  `goal_pace`, plus `blocked_goals()`. Not a list of every goal; a list of the
  ones where something is true.
- **Effort against outcome** — the divergence chart, per goal, from
  `effort_outcome_series`.
- **Where the hours went** — `planning_bias` over the range, with the
  uncategorised row included rather than dropped. It is usually the interesting
  one.

`recharts` is already a dependency and unused so far. Read the `dataviz` skill
before writing the first chart.

Also land the three items carried over from Phase 2, which now have somewhere to
live: a **week view** over the ledger, the **planning-bias surface**, and
**blocked-task warnings**.

## Tests

Vitest against hand-computed fixtures in `src/lib/metrics/`, following the
existing pattern — `__fixtures__/phase-2.ts` shares its numbers with
`supabase/tests/phase-2.sql` deliberately, so a drift between mirror and
authority fails a gate. Do the same here.

- Allocation with a category that is logged but has no productive flag either way
- A series containing a day with no plan — fidelity null, and the null survives
  whatever transformation feeds the chart
- Effort and outcome series over a range where one has data and the other does not

SQL assertions in a new `supabase/tests/phase-3.sql`, picked up automatically by
`npm run db:test`:

- `allocation` over a range with productive and unproductive time, hand-computed
- `adherence_series` returns one row per day including days with no slots at all
- a day with no plan comes back with null fidelity **inside the series**, not
  missing from it — a dropped row and a null row look identical in a chart and
  mean completely different things
- RLS: a second user's JWT reads zero rows from all three new functions

## Acceptance

1. `npm run build` passes.
2. `npm run test` and `npm run db:test` pass.
3. Every figure on the dashboard traces to a SQL function or view. Grep the
   dashboard directory for arithmetic; anything that is not formatting is a bug.
4. Every metric that can be undefined renders as words, and the wording says
   *why* — "nothing was planned", not "—".
5. RLS verified on the new functions.
6. `STATUS.md` updated, `docs/phases/phase-4.md` written.

## Things that will bite you

- Run everything from `D:\Portfolio\synapse` (lowercase). See the casing entry in
  `STATUS.md` — building from the wrong casing fails with an invariant error that
  looks like a Next.js bug.
- `npm run typecheck` fails on a cold checkout until `npm run build` has run once,
  because `PageProps`/`LayoutProps` are generated.
- Ids validate with `z.guid()`, never `z.uuid()`. See the entry in
  `docs/CONVENTIONS.md`; `z.uuid()` rejects every seeded goal id.
- Only async functions may be exported from a `"use server"` module.
- An action fired from inside a dialog must render its error inside that dialog.
- Do not name any module inside a route directory `layout.ts`; Next treats it as
  a route layout.
- `npm run seed:day -- --verify` gives you a populated day and prints the figures
  it should produce, which is the fastest way to check a chart against the truth.
