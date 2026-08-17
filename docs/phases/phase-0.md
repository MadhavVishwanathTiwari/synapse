# Phase 0 — Foundation ✅

Complete. Recorded for reference; nothing here needs doing again.

## Delivered

**Toolchain.** Next.js 16.3.1, React 19.2.8, TypeScript strict, Tailwind v4,
Turbopack, Vitest, ESLint flat config, Prettier.

**Security.**
- `.githooks/pre-commit` scans staged content for Supabase secret keys, JWTs,
  Google OAuth secrets, Telegram tokens and Postgres URIs with inline passwords.
  Wired via `core.hooksPath` (set by `npm run prepare`). Verified by committing
  a fake `GOCSPX-` string and watching it fail.
- `.gitignore` covers `.env*` plus defensive patterns for scratch files, which
  is how secrets usually escape.
- ESLint rule blocks `@/lib/supabase/admin` and raw `createClient` imports under
  `src/app/**` and `src/components/**`. Verified with a probe file.

**Database.** Migration `20260816120000_init.sql` applied: `notion_color` enum,
`profiles`, `categories`, `set_updated_at()`, `handle_new_user()`. RLS enabled
with owner-scoped policies on both tables.

**App.** Notion dark tokens, base components, sidebar shell showing the full
information architecture with unbuilt routes rendered inert, email+password
auth, session refresh in `src/proxy.ts`, protected `(app)` route group,
dashboard reporting only real values, settings page writing through RLS.

## Things learned that cost time

- `create-next-app` derives the package name from the directory, and npm
  rejects capitals. The directory was renamed `Synapse` → `synapse`.
- `create-next-app` refuses to scaffold into a directory containing *any*
  files, including `.env.local`. Scaffold to a temp directory and copy in.
- Next 16 deprecated `middleware` in favour of `proxy` — file `src/proxy.ts`,
  exported function `proxy`.
- `LayoutProps` / `PageProps` are generated into `.next/types`; `npm run
  typecheck` fails on a clean checkout until `npm run build` has run once.
- Supabase's direct Postgres host is IPv6-only, and many networks block 5432
  and 6543 outright. `scripts/db.mjs` probes candidates and falls back.
- `supabase gen types --db-url` shells out to Docker. `--project-id` with a
  `SUPABASE_ACCESS_TOKEN` avoids that entirely.

## Outstanding

`src/lib/supabase/database.types.ts` is hand-written pending a
`SUPABASE_ACCESS_TOKEN`. Until that exists it must be updated by hand with every
migration — a real hazard, since drift between it and the database is silent.
Resolving this should be the first thing done in Phase 1.
