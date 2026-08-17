# Conventions

## Layout

```
src/
  app/
    (auth)/login/          sign-in, unauthenticated
    (app)/                 authenticated shell — sidebar + main
      dashboard/
      settings/
    layout.tsx             fonts, metadata, providers
    globals.css            ALL design tokens live here
    providers.tsx          TanStack Query
  components/
    ui/                    primitives (button, input, dialog, …)
    layout/                shell pieces (sidebar, page-header)
  lib/
    supabase/              client / server / admin / proxy / generated types
    auth/                  auth server actions
    env.ts                 validated environment access
    utils.ts               cn()
  proxy.ts                 session refresh + route gating (Next 16 name)
supabase/
  migrations/              append-only SQL
  functions/               Deno Edge Functions (Phase 4+)
scripts/db.mjs             Supabase CLI wrapper
docs/                      this directory
```

Feature-specific components live beside the route that uses them
(`app/(app)/settings/settings-form.tsx`). Only genuinely shared pieces go in
`src/components`.

## Supabase clients — pick the right one

| Import | Key | RLS | Use for |
|---|---|---|---|
| `@/lib/supabase/client` | publishable | enforced | Client Components |
| `@/lib/supabase/server` | publishable + session | enforced | Server Components, Actions, Route Handlers |
| `@/lib/supabase/admin` | secret | **bypassed** | Edge Functions only |

Server code uses the *publishable* key deliberately. Paired with the session
cookie it makes `auth.uid()` resolve inside Postgres, so RLS does the
authorisation. Reaching for a privileged key on the server is the usual way
people accidentally disable every policy they wrote.

If a query returns nothing and you are tempted to switch to the admin client,
the bug is a missing policy, not the client.

## Auth

`supabase.auth.getUser()` verifies the JWT with the auth server.
`getSession()` reads the cookie without validating it. Never make an
authorisation decision from `getSession()` on the server.

## Database

- Append-only migrations, named `<timestamp>_<slug>.sql`.
- Every table: `id`, `user_id`, `created_at`, `updated_at`, RLS policies,
  and an `updated_at` trigger using `public.set_updated_at()`.
- Policies use `(select auth.uid())` rather than bare `auth.uid()` — the
  subquery form is evaluated once per statement instead of once per row, which
  matters on the time-slot table.
- Prefer `archived_at` over `DELETE` for anything historical metrics reference.
  Deleting a category would silently rewrite past adherence figures.
- Money: `amount_minor bigint`. Never float, never numeric.
- Timestamps: `timestamptz`, always UTC.

## Connection strings

| Variable | Port | Use |
|---|---|---|
| `SUPABASE_DIRECT_URI` | 5432 | migrations, DDL — **IPv6 only** |
| `SUPABASE_SESSION_URI` | 5432 | IPv4 fallback for DDL; long-lived connections |
| `SUPABASE_TRXN_URI` | 6543 | serverless raw connections — **no DDL, no prepared statements** |

The transaction pooler runs PgBouncer in transaction mode. Prepared statements
are unsupported there; ORMs that assume otherwise fail intermittently under
load rather than immediately, which makes it a nasty class of bug. `scripts/db.mjs`
never uses it.

## Metrics

Defined once in SQL as a view or function, consumed by both the app and the
Edge Functions. Pure helper maths that has no database dependency (EWMA over an
array, e1RM from weight and reps) may live in `src/lib/metrics/` **as long as
the authoritative aggregate is still the SQL definition** — the TS version
exists to be unit-tested and to render, not to compute what the bot reads.

Every such helper gets Vitest tests against hand-computed fixtures. These are
pure functions of known inputs; there is no excuse for approximate testing.

## Styling

- Tokens only. No raw hex outside `globals.css`.
- `cn()` for all class composition.
- Dark theme only. Do not add `dark:` variants — there is no light mode.
- Numbers use `font-mono` so columns align.
- Notion metrics: 28–32px controls, 3–6px radii, no shadows except on modals
  and popovers.

## Validation

- **Ids are `z.guid()`, never `z.uuid()`.** Zod 4's `uuid()` enforces the RFC 9562
  version and variant nibbles, so it rejects well-formed 128-bit ids that are not
  a generated v4 — including every hand-authored id in `scripts/seed-goals.mjs`
  (`5eed0000-…`, whose version nibble is 0). Postgres's `uuid` type accepts those,
  so `uuid()` has the app refusing ids the column considers valid. This shipped
  broken in Phase 1 and surfaced in Phase 2 as "Invalid UUID" on every edit
  against a seeded goal.
- More generally: a schema that validates harder than the database is inventing a
  constraint the schema never had. Mirror the constraint, do not exceed it.

## Server Actions

- `"use server"` at the top of the file, not per-function.
- Only async functions may be exported from a `"use server"` module. Constants and
  initial-state objects belong in the schema module or the component beside it.
- Validate every input with Zod before touching the database.
- An action fired from inside a dialog must report its failure **inside that
  dialog**. A modal covers the page, so an error rendered on the page behind it
  is invisible — and with optimistic state still applied, the screen shows the
  write as though it had succeeded.
- Return typed state objects for `useActionState`; do not throw for user errors.
- Redirect targets from user input must be checked for same-origin
  (`startsWith("/") && !startsWith("//")`) or you have built an open redirect.

## Errors

Surface real errors. Do not swallow a failure and render an empty state that
looks like "no data" — for this app in particular, a silent zero is
indistinguishable from a true zero and that is exactly the confusion the whole
project exists to eliminate.
