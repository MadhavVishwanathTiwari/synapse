# Phases

Build order and acceptance criteria. Detailed briefs live in `docs/phases/`.

**Briefs are written just-in-time.** Each phase writes the next phase's brief as
part of its definition of done. Writing all nine up front would produce
confident detail about code that does not exist yet, and it would be wrong by
the time anyone read it. `PHASES.md` holds the durable shape; the brief holds
the specifics.

To resume in a fresh session: paste `docs/phases/phase-N.md` and say "continue
the build". Nothing else from prior conversations is needed.

---

## Phase 0 — Foundation ✅

Scaffold, design system, auth, Supabase wiring, docs.

**Acceptance:** app builds; sign-in works; settings page writes to `profiles`
through RLS; secret-scanning hook and RLS lint rule both verified to fire.

---

## Phase 1 — Goal graph ✅

The spine. Everything else attaches to this.

- `goals`, `goal_links`, `goal_revisions`, `goal_progress`
- Acyclicity trigger; contribution-weight ≤ 1.0 trigger
- `goal_effort_rollup()`, `goal_outcome_rollup()`, `goal_pace()`
- Graph UI: create, link, reweight; ancestry visualiser (task → decade)
- Per-horizon planner views for all six horizons

**Acceptance:** a cycle insert raises; weights >1.0 raise; a diamond-shaped
graph attributes effort without double-counting; editing a decade target leaves
historical pace charts unchanged; Vitest covers the rollup maths.

---

## Phase 2 — Time ledger ✅

First genuinely usable version.

- `time_slots`, 900-second alignment constraint, `get_day_grid()`
- `day_coverage()`, `day_fidelity()`, `planning_bias()` — all SQL, read by both
  the dashboard and the Phase 5 nudge engine
- 96-slot grid: drag-to-paint, optimistic updates, keyboard entry
- **Day-close ritual**: coverage and fidelity once at the end, plan-versus-actual
  side by side, fill the gaps from the plan

**Acceptance:** painting a range writes aligned slots; unlogged gaps inside the
waking window are detectable in one query; effort rolls up the goal graph.

**Deferred, and why.** Three bullets from the original sketch were not in
`docs/phases/phase-2.md` and did not ship:

- *Week view* — the day grid is the daily-use surface; a week view is a reporting
  view and belongs beside the dashboard.
- *Planning-bias multipliers inline while planning* — `planning_bias()` exists and
  is tested, but surfacing it during planning needs the dashboard's charting
  vocabulary to not be a wall of numbers.
- *Blocked-task warnings from `depends_on`* — `blocked_goals()` has existed since
  Phase 1; this is a rendering task, not a modelling one.

All three carry into Phase 3, where they have somewhere coherent to live.

---

## Phase 3 — Dashboard ✅

Where the graph and the ledger finally meet.

- `allocation`, `allocation_summary` — the third ADR 007 adherence number
- `adherence_series` — coverage and fidelity per day, calling the per-day
  functions rather than restating them
- `effort_outcome_series` — the ADR 004 divergence, two series never combined
- `goals_needing_attention` — a selection over `goal_pace` and `blocked_goals`
- Today's three numbers, each with its denominator; the 7/30/90 adherence trend;
  goals needing attention; effort against outcome; allocation and planning bias
- Week view over the ledger at `/week` *(carried from Phase 2)*
- Planning-bias surface per category *(carried from Phase 2)*
- Blocked-task warnings from `blocked_goals()` *(carried from Phase 2)*

**Acceptance:** every figure traces to a SQL function or view — a grep of the
dashboard and week directories finds no arithmetic that is not formatting;
`supabase/tests/phase-3.sql` asserts the new functions against hand-computed
figures, including that a day with no plan is a null row *inside* the series;
every undefined metric renders as words saying why.

**On Playwright.** The original acceptance line here named a Playwright run
asserting rendered numbers against direct SQL. It was not carried into
`docs/phases/phase-3.md` and did not ship: Playwright is not a dependency, and
the property it would check is covered from both ends already — the SQL
assertions pin the figures, and the grep proves the UI cannot have transformed
them. Revisit if a figure ever disagrees with its function in the browser; that
would be evidence the pairing is not enough.

**Deferred, and why.** Three bullets from the original sketch were not in
`docs/phases/phase-3.md` and did not ship:

- *Projection bands from rate variance* — `goal_pace` reports one EWMA rate, not
  a distribution. Bands need a variance term the function does not compute, and
  inventing one from three progress entries would be the exact fabrication hard
  rule 8 exists to prevent.
- *Conversion calibration surface* — comparing declared conversion factors
  against observed ones needs a history of both. The declarations exist since
  Phase 1; the observations arrive as `goal_progress` accumulates.
- *Goal drift report* — `goal_revisions` has the data, but a drift report is a
  review artefact, and Phase 8 is where revisions are legitimately made.

All three carry to Phase 8, where they have somewhere coherent to live.

---

## Phase 4 — Calendar ⬅ next

- Google OAuth, refresh token encrypted at rest
- `gcal-sync` Edge Function, `syncToken` incremental, `pg_cron` every 10 min
- Synapse blocks tagged `extendedProperties.private.synapse_block_id`
- Conflict log; Google authoritative for its events, Synapse for its blocks

**Acceptance:** create in Google → appears within one poll; create in Synapse →
lands in Google with the tag; simultaneous edits → conflict logged with the
resolution recorded.

Needs: `GOOGLE_OAUTH_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`.

---

## Phase 5 — Telegram

- Bot registration, `telegram-webhook` Edge Function
- `nudge-engine` every 15 min evaluating all four rules
- Rate limiting, dedupe by rule+entity, quiet hours, **dry-run mode**

**Acceptance:** dry-run reports what it would send against real history without
sending; quiet hours suppress; a repeated condition does not re-fire inside its
cooldown.

Needs: `CRON_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`.

---

## Phase 6 — Finance

- Accounts, envelopes, zero-based assignment invariant in-database
- Quick-entry, CSV import with column mapping and `import_hash` dedupe
- Telegram capture (`340 groceries`)
- Net worth, runway, 2σ anomaly flags

**Acceptance:** `Σ assigned = available` cannot be violated; re-importing the
same statement creates no duplicates; all money is integer minor units.

---

## Phase 7 — Gym

- Exercise library, workout logger
- e1RM reported as an Epley/Brzycki pair
- Volume load, three-axis PR detection, bodyweight EWMA + regression slope
- Acute:chronic workload ratio, labelled as a heuristic

**Acceptance:** PR detection catches rep-PRs at submaximal weight; bodyweight
trend does not move materially on a single outlier reading.

---

## Phase 8 — Reviews

Weekly / monthly / quarterly / annual review flows that walk the graph, prompt
direct outcome entry for long-horizon goals, and surface calibration and drift.
This is where decade goals get legitimately revised.

- Conversion calibration surface *(carried from Phase 3)*
- Goal drift report over `goal_revisions` *(carried from Phase 3)*
- Pace projection bands, once there is enough history for a variance term
  *(carried from Phase 3)*

**Acceptance:** a revision made during review is logged and historical pace is
unaffected.
