# Status

**Last updated:** 2026-08-17
**Current phase:** 3 complete → Phase 4 next

## Where things stand

The graph and the ledger are in the same room. `/dashboard` reads today's three
adherence numbers, a 7/30/90-day trend, the goals where something is actually
wrong, effort against outcome, and where the hours went — and every figure on it
comes from a Postgres function. There is no arithmetic in the dashboard or week
directories that is not formatting, a date shift, or a bar width.

Three new metric functions, one composition over two existing ones, and a lot of
sentences. The sentences are most of the work: `adherence_series` returns a null
fidelity on a day with no plan, `allocation_summary` a null share over an empty
range, `effort_outcome_series` a null outcome on a day with no entry, and
`goal_pace` null rates in five of its eight statuses. Every one of those reaches
the screen as words saying *why* — "nothing was planned for this day", not "—".

The divergence chart is two stacked plots over one time axis rather than the
obvious dual-axis version, and outcomes get one small plot per goal in that
goal's own unit. Hours and rupees cannot share a scale, and indexing them to a
common base would make the picture look right while asserting a comparison the
data cannot support. ADR 021.

100 SQL assertions across three files and 113 Vitest tests now run on every
gate. `npm run build`, `npm run lint`, `npm run test` and `npm run db:test` all
pass.

## Done

### Phase 0 — foundation

- Next.js 16.3.1, React 19.2.8, TypeScript strict, Tailwind v4, Turbopack
- Git with a secret-scanning pre-commit hook — **verified** against a real secret
- Notion dark tokens; button, input, label, dialog, popover; sidebar; page header
- Supabase clients with correct key routing (browser / server / admin)
- ESLint rule blocking RLS-bypassing imports in app code — **verified** to fire
- `20260816120000_init.sql`: `profiles`, `categories`, `notion_color`,
  `set_updated_at()`, `handle_new_user()`
- Email + password auth, session refresh via `src/proxy.ts`, protected route group
- `scripts/db.mjs` — connection probing with IPv6/pooler fallback

### Phase 1 — goal graph

- `20260817090000_goal_graph.sql`: `goals`, `goal_links`, `goal_revisions`,
  `goal_progress`; three enums; RLS on all four; `updated_at` triggers
- Composite foreign keys `(goal_id, user_id) → goals(id, user_id)` so both ends
  of every link and every progress row provably belong to one user
- Acyclicity trigger (`SY001`), per link type; weight-budget constraint trigger
  (`SY002`) with an advisory lock; revision-logging trigger
- `goal_own_hours`, `goal_effort_shares`, `goal_effort_rollup`,
  `goal_outcome_rollup`, `goal_pace`, `goal_ancestry`, `blocked_goals`,
  `critical_path`, `update_goal_targets`
- `goal_overview` and `goal_weight_budget` views, both `security_invoker = on`
- `20260817140000_pace_ewma_normalised.sql` — corrected the achieved-rate EWMA;
  see ADR 015
- `/goals` board, goal detail, link editor with a live weight budget, revision
  prompt, and the ancestry visualiser (hand-rolled SVG, no graph dependency)
- `scripts/seed-goals.mjs` — the acceptance chain, with one conversion left
  undeclared on purpose

### Phase 2 — time ledger

- `20260818090000_time_ledger.sql`: `slot_kind` enum, `time_slots` with RLS, the
  900-second alignment check, and the composite goal foreign key
- `goal_own_hours()` rewritten to count actual slots — the whole integration with
  Phase 1. Nothing in the recursion above it changed.
- `get_day_grid`, `day_coverage`, `day_fidelity`, `planning_bias`, all SQL, all
  security invoker, all taking an optional `user_id` so Phase 5's nudge engine
  reads the same definitions the dashboard does
- `supabase/tests/phase-2.sql` — 34 assertions
- `src/lib/metrics/slots.ts` and `adherence.ts` with hand-computed fixtures
  shared with the SQL
- `/today`: 96-row grid, click and drag to paint, full keyboard control,
  plan-versus-actual columns, optimistic writes, and the day-close dialog
- `scripts/seed-day.mjs` — one planned-and-lived day, with `--verify` printing
  the rollups and adherence

### Phase 3 — dashboard

- `20260819090000_dashboard_metrics.sql`:
  - `allocation` / `allocation_summary` — the third ADR 007 number. Keeps the
    uncategorised row, reports its `is_productive` as **null** rather than false,
    and leaves it in the denominator. ADR 019.
  - `adherence_series` — one row per day, *calling* `day_coverage` and
    `day_fidelity` rather than restating them. Costs two `get_day_grid` calls a
    day and is the correct trade every time: a one-pass rewrite would be a second
    definition of both metrics.
  - `effort_outcome_series` — reuses `goal_effort_shares` for the weighting, and
    the goal's own `goal_progress` for the outcome, never the depth-limited
    rollup. ADR 020.
  - `goals_needing_attention` — a selection over `goal_pace` and `blocked_goals`.
    Not in the brief; the alternative was one round trip per goal.
- `supabase/tests/phase-3.sql` — 23 assertions, including that a day with no plan
  comes back as a **null row inside the series** rather than a missing one, and
  that user B reads nothing from any of the five functions even when passing user
  A's id as `p_user_id`
- `src/lib/metrics/allocation.ts` (mirror) and `series.ts` (chart mappers), with
  `__fixtures__/phase-3.ts` sharing its numbers with the SQL. 24 new Vitest
  tests; the load-bearing one asserts a null fidelity survives the transformation
  that feeds the chart, not merely that the SQL returned it.
- `--color-series-1..4` in `globals.css`, validated as a set against `#252525`:
  worst adjacent pair ΔE 8.4 protan, 19.8 normal-vision, all above 3:1 contrast.
  The tag palette failed three checks as a line set and is not used for charts.
- `/dashboard`: today's three numbers with their denominators, the 7/30/90
  adherence trend with gaps where fidelity is undefined, goals needing attention,
  effort against outcome with a goal picker, allocation, planning bias. One
  filter row above everything it scopes; every chart has a table twin.
- `/week`: seven days of the ledger, plan beside actual, read-only, per-day
  coverage and fidelity from `adherence_series`. Carried from Phase 2.
- `Panel` and `Figure` promoted from `goals/[id]/panel.tsx` to
  `components/ui/panel.tsx`, now that two routes use them.
- ESLint now also blocks `@/lib/metrics/adherence` and `@/lib/metrics/allocation`
  in app code, alongside `rollup` and `pace`. `series` is deliberately allowed —
  it computes no metric.

**The acceptance grep**, which is criterion 3 of the phase. Note the leading `]`
inside each bracket expression — a backslash is literal inside POSIX brackets, so
the intuitive `[A-Za-z0-9_)\]]` silently matches almost nothing and the check
passes for the wrong reason:

```bash
grep -rnE "[]A-Za-z0-9_)] *[*+/] *[[A-Za-z0-9_(]|[]A-Za-z0-9_)] +- +[[A-Za-z0-9_(]|Math\.|\.reduce\(" "src/app/(app)/dashboard" "src/app/(app)/week" | grep -vE "^[^:]+:[0-9]+:(import|} from|\s*\*|\s*//)"
```

It currently returns five lines: a bar width, an inclusive date shift, two
ratio-to-percentage conversions, and a row count for the week grid's layout.
Every one is formatting or geometry. Anything else appearing here is a metric
that belongs in a migration.

## Fixed on the way through

| Bug | Detail |
|---|---|
| `z.uuid()` rejected every seeded id | Zod 4's `uuid()` enforces the RFC 9562 version nibble, so `5eed0000-…` (version 0) failed validation and **every** link, progress and target edit against a seeded goal died with "Invalid UUID". Now `z.guid()` throughout. |
| `on delete set null` on a composite FK | Unqualified, it nulls *every* referencing column including `user_id`, which is `NOT NULL`. Named the column: `on delete set null (goal_id)`. |
| Errors hidden behind the day-close modal | A failed write reported itself to the page under the dialog while the optimistic row stayed on screen. The dialog surfaces its own errors now. |
| Stale effort copy on the goal detail card | It still read "no time is logged until the Phase 2 ledger exists" while displaying 2.75 h above it. |

## Verified in the browser

Signed in against the seeded 2026-08-17, on a production build:

- The three numbers match `npm run seed:day -- --verify` exactly — coverage
  **25%** (16 of 64), fidelity **63%** (10 of 16), allocation **88%** (3.5 h of
  4 h). `/week` reports the same two figures for the same day.
- Two goals with different units produce two separate outcome plots, with the
  reason printed. A goal with no progress in the range prints the sentence
  instead of an empty frame.
- The table twin shows **"no plan"** in words where fidelity is undefined.
- Range 7 / 30 / 90 moves every panel together. Console clean, no hydration
  warnings from recharts.

**The browser pass earned its place — it found three defects the tests could
not.** All three are fixed, and each left something behind:

| Defect | Why no test caught it |
|---|---|
| The fidelity series rendered as a **zero-length SVG path** (`M1180,82.25Z`) and nothing else. With one planned day in the range it is a single point, and a line needs two. The series was invisible while its legend entry promised it. | Every test asserted the *data* reaching the chart, which was correct. Nothing asserted the geometry that came out. `isolatedIndices` in `series.ts` now marks points with no neighbour and `isolatedDot` draws them; five new Vitest cases pin it, including that a `0` is not mistaken for a gap. |
| `—/day needed · 16/day achieved` on an overdue goal — a bare dash with no explanation, which is exactly what acceptance criterion 4 forbids. `goal_pace` nulls the required rate and the achieved rate under *different* conditions, so they cannot be shown or hidden together. | The rates were rendered as a pair behind one `!== null` check. Now each is printed only if it exists. |
| **Every explicit goal selection came back empty.** `MAX_SELECTED` was exported from `divergence-chart.tsx`, a `"use client"` module; the server component imported a client *reference*, not `4`, so `valid.slice(0, thatObject)` coerced to `NaN` and returned `[]`. The default path returned before slicing, which is why the page looked fine on load. | No error anywhere — not in the build, the lint, the types, or the console. Constant moved to `display.ts`; the rule is now in `docs/CONVENTIONS.md` under Client Components. |

Also fixed: `/week` reported **0% coverage for future days**. True in the SQL and
a real measurement for a past day, but for tomorrow it is an accusation about a
day that has not happened. Future days read "upcoming"; fidelity still says "no
plan", because that one is actionable.

## Immediate next step

Phase 4, the calendar. Read `docs/phases/phase-4.md`.

## Known issues / debt

| Item | Detail |
|---|---|
| Nothing asserts rendered geometry | The zero-length-path bug above got through because every gate checks the data going *into* the chart, never the SVG coming out. `isolatedIndices` closes that specific hole; the general one is open. A Playwright run reading `path.recharts-curve` would close it — see the Playwright note in `docs/PHASES.md`. |
| Project directory casing | The folder on disk is `D:\Portfolio\synapse` (lowercase). Opening it as `D:\Portfolio\Synapse` makes Node resolve `node_modules` under two casings, which loads Next's internals twice and breaks prerendering with `Invariant: Expected workStore to be initialized` during `npm run build`. Dev is unaffected. |
| One dev server per project | Next 16 refuses a second `next dev` for the same directory. `npm run build && npx next start -p 3100` works alongside an existing dev server and is how Phase 3 was smoke-tested. |
| A wedged dev server on :3000 | Observed during Phase 3: a `next dev` from an earlier session held the port, listening on `::` only, and never answered a request. `next start` on another port was the way round it. |
| `adherence_series` cost | Two `get_day_grid` calls per day — 180 for a 90-day range. Deliberate (hard rule 1) and fine for one user. If it ever needs to be faster, the fix is an index or a materialised day table, **not** a second definition of coverage. |
| "An unexpected response was received from the server" | Seen once on the dev server in Phase 2 while editing `today/actions.ts`. Never isolated; has not recurred on a production build. |
| `SUPABASE_ACCESS_TOKEN` expires Aug 2027 | Type generation goes through the Management API. When `npm run db:types` starts failing with an auth error, that is why. |
| Function return types come out non-null | Postgres records no nullability on a function's OUT parameters, so the generator marks every nullable metric column `number`. Narrowed aliases live in `src/lib/supabase/types.ts`; use them at every query boundary. This is the single thing standing between the generated types and a fabricated 0%. |
| Not deployed | No Vercel project. Vercel Hobby crons cannot run more than daily, which is why scheduling lives in `pg_cron` from Phase 5. |
| Network fragility | Postgres ports are blocked on some networks (mobile hotspot works). Unrelated to credentials. |

## Next phase

`docs/phases/phase-4.md` — Google Calendar. The first phase where the system has
to survive contact with a data source it does not control, and the first with an
Edge Function. Needs `GOOGLE_OAUTH_REDIRECT_URI` and `TOKEN_ENCRYPTION_KEY`.
