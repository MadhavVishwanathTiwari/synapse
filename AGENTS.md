<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Synapse

A single-user quantified life OS: goal graph, 15-minute time ledger, Google
Calendar sync, Telegram nudges, envelope finance, gym tracking.

**Start here if you are resuming this build:** read `STATUS.md` for current
state, then the brief for the next phase in `docs/phases/`. Each brief is
self-contained — you do not need this conversation's history.

## Hard rules

These are load-bearing. Violating any of them produces a system that reports
numbers it cannot justify, which defeats the entire point of the project.

1. **Metrics are SQL, never TypeScript.** Every metric (adherence, pace, effort
   rollup, planning bias, e1RM, runway) is defined once as a Postgres view or
   function. The dashboard and the Telegram nudge engine both read that one
   definition. A metric reimplemented in TS is a bug, because the bot and the UI
   will eventually disagree and you will not know which is right.

2. **Money is integer minor units.** Paise, never rupees; `amount_minor bigint`,
   never `numeric` or `float`. No exceptions, including "just for display".

3. **RLS on every table, always.** New table means new policies in the same
   migration. There is no such thing as a table that "doesn't need" them.

4. **RLS-bypassing keys never enter app code.** `sb_secret_*` and
   `service_role` bypass Row Level Security completely — `sb_secret_*` is not a
   middle tier, it is the direct replacement for `service_role`. App code uses
   `@/lib/supabase/server` (publishable key + user session, so `auth.uid()`
   resolves). Privileged access lives only in `supabase/functions/**`. Enforced
   by ESLint; do not disable the rule.

5. **Slot times are UTC and 900-second aligned.** `extract(epoch from
   slot_start)::bigint % 900 = 0` is a database constraint. Local time exists
   only for display and for projecting the user's waking window.

6. **Contribution weights sum to ≤ 1.0 per child.** A goal contributing to two
   parents splits its effort between them. Allowing 1.0 to each double-counts
   and silently inflates every ancestor's totals.

7. **Migrations are append-only.** Never edit an applied migration; add a new
   one. `supabase/migrations/` is the schema's history and point-in-time
   correctness depends on it.

8. **Never fabricate a metric in the UI.** If there is no data yet, say so.
   Placeholder charts with plausible numbers are worse than an empty state.

## Commands

```bash
npm run dev          # dev server (Turbopack)
npm run build        # production build — also typechecks and lints
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # vitest run

npm run db:status    # list local vs applied migrations
npm run db:push      # apply pending migrations
npm run db:types     # regenerate src/lib/supabase/database.types.ts
npm run db:test      # every supabase/tests/*.sql, each rolled back

npm run seed:goals   # the acceptance goal chain
npm run seed:day     # one planned-and-lived day against it (-- --verify)
```

## Environment notes that will bite you

- **The direct Postgres host is IPv6-only.** `db.<ref>.supabase.co` publishes
  AAAA records only. On IPv4-only networks use the session pooler;
  `scripts/db.mjs` probes and falls back automatically. The transaction pooler
  (`:6543`) cannot run DDL and is deliberately excluded.
- **Many networks block outbound 5432/6543.** If every connection times out
  while HTTPS works, that is the cause — not credentials.
- **Type generation needs no Docker** if `SUPABASE_ACCESS_TOKEN` is set; it then
  uses the Management API. Without it the CLI falls back to a Docker-based path.
- **Next 16 renamed `middleware` to `proxy`.** The file is `src/proxy.ts` and it
  exports `proxy`.
- **`LayoutProps<"/">` / `PageProps<"/route">` are generated types.** They do not
  exist until after a build, so a cold `npm run typecheck` fails until you have
  run `npm run build` at least once.

## Documentation map

| File | Contents |
|---|---|
| `STATUS.md` | What is done, what is next, known issues |
| `docs/PHASES.md` | All phases with acceptance criteria |
| `docs/SCHEMA.md` | Data model and the reasoning behind it |
| `docs/DECISIONS.md` | ADR log — why things are the way they are |
| `docs/CONVENTIONS.md` | Code layout, naming, patterns |
| `docs/phases/phase-N.md` | Self-contained brief for one phase |

## Definition of done for any phase

A phase is not complete until all of these hold:

1. `npm run build` passes (this covers typecheck and lint).
2. New metric logic has Vitest tests against hand-computed fixtures.
3. New tables have RLS policies and those policies are verified.
4. `STATUS.md` is updated.
5. The next phase's brief in `docs/phases/` is written or refreshed.

Steps 4 and 5 are part of the work, not an afterthought. They are what makes the
next session possible.
