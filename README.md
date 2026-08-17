# Synapse

A single-user quantified life OS — goal graph, 15-minute time ledger, Google
Calendar sync, Telegram nudges, envelope budgeting, gym tracking.

Built to replace Notion with something where every number on screen is defined,
derivable and honest.

## What makes it different

**Time is a closed ledger.** 96 slots of 15 minutes a day. Inside your waking
window every slot is planned, actual, or explicitly `unlogged` — you cannot
quietly lose four hours, because missing time is itself a measurement.

**Three adherence numbers, never one.** Coverage (are you recording?), fidelity
(did you do what you said?) and allocation (are your hours going where your
priorities are?) are orthogonal. Blending them into a "productivity score"
destroys the information that makes them actionable.

**Goals form a DAG, not a tree.** Every task traces up through week, month,
quarter, year and decade. A task can serve multiple parents, splitting its
effort between them — weights are constrained to sum to ≤ 1.0 so ancestor
totals never inflate.

**Effort rolls up exactly; outcomes don't pretend to.** Hours propagate the full
chain with zero conversion error. Outcome quantities only cross edges with
declared, adjacent units. Your decade net worth is *measured*, not derived from
today's cold emails — because five hops of ±30% assumptions produce noise, and
showing that as a progress bar would be a lie.

**Your plans get calibrated against your history.** The app tracks how long
things actually take you versus how long you estimated, per category, and shows
the multiplier while you plan tomorrow night.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind v4 · Supabase (Postgres, Auth,
Edge Functions, `pg_cron`) · Vercel

## Setup

```bash
npm install
cp .env.example .env.local   # fill in from the Supabase dashboard
npm run db:push
npm run dev
```

Then create your account: Supabase dashboard → Authentication → Users →
**Add user**, with *Auto Confirm User* ticked. There is no public sign-up route
by design. Signing up seeds your profile and ten starter categories
automatically.

## Documentation

| File | Contents |
|---|---|
| `STATUS.md` | Current state, next step, known issues |
| `AGENTS.md` | Hard rules and environment gotchas |
| `docs/PHASES.md` | Build phases and acceptance criteria |
| `docs/SCHEMA.md` | Data model and reasoning |
| `docs/DECISIONS.md` | Why things are the way they are |
| `docs/CONVENTIONS.md` | Code layout and patterns |
