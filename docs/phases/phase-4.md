# Phase 4 — Calendar

**Self-contained brief.** Paste this into a fresh session with "continue the
build" and it has everything needed. Read `AGENTS.md` for the hard rules first,
then `STATUS.md` for where things actually stand.

## Why this comes next

Phases 1 to 3 built a closed system: goals, the hours spent on them, and the
figures that fall out. Everything in it was entered by hand in Synapse. This is
the first phase where the system has to survive contact with a data source it
does not control.

That is the whole difficulty. Google Calendar is authoritative for its own
events and Synapse is authoritative for the blocks it creates, and both can be
edited between two polls. A sync that assumes one side wins silently loses data
the first time that happens.

## The one thing this phase can get catastrophically wrong

**Writing a loop.** Synapse writes a block to Google; the poll reads it back;
the reader does not recognise it as its own; it writes a time slot; a later sync
pushes that back to Google as a new event. Two of those and the calendar is full
of duplicates, and every adherence figure downstream is wrong because the ledger
has hours in it that nobody lived.

The tag is what breaks the loop:
`extendedProperties.private.synapse_block_id`. Every event Synapse creates
carries it, and the reader skips any event that has one. Write the skip before
the writer, not after — it is much easier to add the guard first than to clean up
a duplicated calendar.

The second thing that goes wrong is quieter. Google returns a `syncToken` and it
expires; on a `410 Gone` the only correct response is a **full resync with the
token cleared**, not a retry. Retrying a dead token in a loop is a silent
no-progress state that looks exactly like "nothing changed".

## What exists already

| Piece | Where |
|---|---|
| `time_slots`, 900-second alignment, `get_day_grid` | `20260818090000_time_ledger.sql` |
| Every adherence metric | Phases 2 and 3 migrations, all security invoker |
| `profiles.timezone`, `waking_start`, `waking_end` | `20260816120000_init.sql` |
| Publishable-key server client | `@/lib/supabase/server` |
| Privileged client, Edge Functions only | `@/lib/supabase/admin` — **ESLint blocks it in app code** |

There are no Edge Functions yet. `supabase/functions/` exists in the layout but
this phase is the first to put something in it.

## What is new

### Schema — `supabase/migrations/<ts>_calendar.sql`

- `calendar_accounts` — one row per connected Google account. Holds the
  encrypted refresh token, the current `syncToken`, and the last successful poll.
- `calendar_events` — Google's events, mirrored locally so the UI does not need
  a network round trip to render a week.
- `calendar_blocks` — Synapse's own blocks, each with the `synapse_block_id` it
  pushed to Google.
- `calendar_conflicts` — append-only. Both sides' values, the resolution, and
  when it was applied.

RLS on all four, in the same migration (hard rule 3). Composite foreign keys
`(x_id, user_id) → parent(id, user_id)` as elsewhere, so both ends of every
reference provably belong to one user.

### Token encryption

The refresh token is a long-lived credential for a third-party account and must
be encrypted at rest with `TOKEN_ENCRYPTION_KEY`, not merely protected by RLS.
Encrypt and decrypt in the Edge Function; the key never reaches app code, and
neither does the plaintext token.

`sb_secret_*` and `service_role` bypass RLS completely and live only in
`supabase/functions/**` — hard rule 4, enforced by ESLint.

### `gcal-sync` Edge Function

- Incremental via `syncToken`, falling back to a full resync on `410`.
- Skips any event carrying `extendedProperties.private.synapse_block_id`.
- Pushes Synapse blocks with that tag set.
- Logs a conflict rather than picking a winner when both sides changed since the
  last sync: Google is authoritative for its events, Synapse for its blocks, and
  a row in `calendar_conflicts` records which rule applied.

Scheduled with `pg_cron` every 10 minutes. Not Vercel Cron — ADR 008; Hobby crons
cannot run more than daily, and this is why scheduling was put in the database.

### UI — `src/app/(app)/calendar/`

The route is already in `NAV` in `src/components/layout/sidebar.tsx` at phase 4;
add it to `BUILT` when it lands.

- Connect / disconnect an account, with the last successful sync visible. A sync
  that has been failing for six hours must say so — a stale calendar that looks
  live is the same class of lie as a fabricated metric.
- The week, with Google events and Synapse blocks visually distinct.
- The conflict log, with what each side said and what was done.

## Environment

Needs `GOOGLE_OAUTH_REDIRECT_URI` and `TOKEN_ENCRYPTION_KEY`. Both go in
`.env.local`; the secret-scanning pre-commit hook is verified and will catch a
committed key.

## Tests

- Vitest against fixtures for the pure parts: conflict classification from two
  timestamps and a last-sync mark, and the tag round-trip.
- `supabase/tests/phase-4.sql`, picked up automatically by `npm run db:test`:
  RLS on all four tables including a second user reading zero rows; the
  append-only property of `calendar_conflicts`; the composite foreign keys
  rejecting a cross-user reference.
- The sync itself needs a recorded fixture rather than a live call. A test that
  hits Google is not a test.

## Acceptance

1. Create in Google → appears in Synapse within one poll.
2. Create in Synapse → lands in Google carrying the tag.
3. Simultaneous edits → a conflict row with the resolution recorded.
4. A tagged event read back from Google creates no duplicate and no time slot.
5. An expired `syncToken` triggers a full resync, once, and recovers.
6. `npm run build`, `npm run test`, `npm run db:test` all pass.
7. RLS verified on the new tables.
8. `STATUS.md` updated, `docs/phases/phase-5.md` written.

## Things that will bite you

- Run everything from `D:\Portfolio\synapse` (lowercase). See the casing entry in
  `STATUS.md`.
- `npm run typecheck` fails on a cold checkout until `npm run build` has run
  once, because `PageProps`/`LayoutProps` are generated.
- Ids validate with `z.guid()`, never `z.uuid()`. See `docs/CONVENTIONS.md`.
- Only async functions may be exported from a `"use server"` module.
- An action fired from inside a dialog must render its error inside that dialog.
- Do not name any module inside a route directory `layout.ts`.
- Google returns all-day events as dates, not timestamps, and recurring events as
  a master plus exceptions. Neither maps onto a 900-second slot; decide what they
  mean before writing the mapper, not while debugging it.
