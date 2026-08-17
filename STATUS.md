# Status

**Last updated:** 2026-08-17
**Current phase:** 2 complete → Phase 3 next

## Where things stand

The goal graph has a leaf term. Time is logged in 15-minute slots, planned and
actual kept separately for the same instant, and `goal_own_hours()` now reads the
ledger — so every rollup above it returns a real number for the first time.

Verified end to end in a signed-in browser against the seeded chain: 11 actual
quarter-hours against *Cold email 20 people* is 2.75 h, which reaches *Cold email
100 people* as 1.925 h (× 0.7) and *₹10Cr net worth* as 0.81 h (× 0.294), and the
ancestry visualiser shows the 0.29 share that produces it. Painting by drag,
keyboard fill, clear, and the day-close ritual all write and persist; coverage
and fidelity moved 25% → 31% and 63% → 88% when four planned gym slots were
filled from the plan, matching SQL exactly.

Seventy-seven SQL assertions across two files now run on every `npm run db:test`,
which no longer means "phase 1 still passes" — it runs every file in
`supabase/tests` in name order.

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
- `supabase/tests/phase-2.sql` — 34 assertions; `phase-1.sql` assertion 12 split
  into 12a (zero before anything is logged) and 12b (1.5 h up the diamond, once)
- `npm run db:test` now runs every file in `supabase/tests`, each in its own
  rolled-back transaction
- `src/lib/metrics/slots.ts` and `adherence.ts` with hand-computed fixtures
  shared with the SQL; 43 new Vitest tests, 89 total
- `/today`: 96-row grid, click and drag to paint, full keyboard control
  (arrows, shift to extend, Enter to fill, Delete to clear, P/A to switch mode),
  plan-versus-actual columns, optimistic writes, and the day-close dialog
- `scripts/seed-day.mjs` — one planned-and-lived day against the seeded chain,
  with `--verify` printing the rollups and adherence

## Fixed on the way through

| Bug | Detail |
|---|---|
| `z.uuid()` rejected every seeded id | Zod 4's `uuid()` enforces the RFC 9562 version nibble, so `5eed0000-…` (version 0) failed validation and **every** link, progress and target edit against a seeded goal died with "Invalid UUID". Shipped broken in Phase 1, found in Phase 2. Now `z.guid()` throughout, which checks the shape and nothing else — the same contract as the Postgres `uuid` column. |
| `on delete set null` on a composite FK | Unqualified, it nulls *every* referencing column including `user_id`, which is `NOT NULL` — so deleting a goal would have failed outright instead of detaching its slots. Named the column: `on delete set null (goal_id)`. Asserted. |
| Errors hidden behind the day-close modal | The fill action reported failure to the page underneath the dialog while the optimistic row stayed on screen, so a write that never happened looked like one that had. The dialog surfaces its own errors now, and `docs/CONVENTIONS.md` says why. |
| Stale effort copy on the goal detail card | It still read "no time is logged until the Phase 2 ledger exists" while displaying 2.75 h above it. |

## Immediate next step

Phase 3, the dashboard. Read `docs/phases/phase-3.md`.

## Known issues / debt

| Item | Detail |
|---|---|
| Project directory casing | The folder on disk is `D:\Portfolio\synapse` (lowercase). Opening it as `D:\Portfolio\Synapse` makes Node resolve `node_modules` under two casings, which loads Next's internals twice and breaks prerendering with `Invariant: Expected workStore to be initialized` during `npm run build`. Dev is unaffected. Either always `cd` to the lowercase path, or rename the folder so one casing is canonical. |
| One dev server per project | Next 16 refuses a second `next dev` for the same directory. To preview while another session holds the lock, `npm run build` then use the `synapse-built` config in `.claude/launch.json`. |
| "An unexpected response was received from the server" | Seen once on the dev server while editing `today/actions.ts`. Two things changed together — a non-async `export const` was removed from that `"use server"` module, and the server was restarted — so **which one fixed it was never isolated**. It has not recurred on a production build. If it reappears: check for non-async exports first, then restart `next dev`. |
| `SUPABASE_ACCESS_TOKEN` expires Aug 2027 | Type generation goes through the Management API. When `npm run db:types` starts failing with an auth error, that is why — mint a new token, not a new theory. |
| Function return types come out non-null | Postgres records no nullability on a function's OUT parameters, so the generator marks `coverage`, `fidelity` and `bias_ratio` as `number` when each is null precisely when the metric is undefined. Narrowed aliases live in `src/lib/supabase/types.ts`; use them at every query boundary. |
| Not deployed | No Vercel project. Vercel Hobby crons cannot run more than daily, which is why scheduling lives in `pg_cron` from Phase 5. |
| Network fragility | Postgres ports are blocked on some networks (observed on the primary connection; mobile hotspot works). Unrelated to credentials. |

## Next phase

`docs/phases/phase-3.md` — the dashboard. Everything it renders already exists as
SQL: the goal graph's rollups from Phase 1 and the ledger's adherence from Phase
2. The phase is mostly about not lying with charts.
