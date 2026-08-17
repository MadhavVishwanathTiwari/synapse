# Decisions

Why things are the way they are. Append new entries; do not rewrite old ones —
if a decision is reversed, add a superseding entry and link back.

---

## 001 — The goal model is a DAG, not a tree

**Decision.** Goals form a directed acyclic graph with typed edges
(`contributes_to`, `depends_on`, `relates_to`), not a `parent_id` tree.

**Why.** A tree cannot express the two things actually required: one task
serving multiple parents ("cold email 20 people" feeds both *get replies* and
*build audience*), and lateral links between goals at the same horizon
("drop out of college" depends on "break ₹X revenue", both yearly).

**Consequences.** Cycles must be prevented by trigger, since a cycle makes the
effort rollup non-terminating. Rollups are recursive CTEs rather than simple
joins.

---

## 002 — Goals and tasks are the same entity

**Decision.** One `goals` table with a `horizon` enum
(`day|week|month|quarter|year|decade`). A "task" is a day-horizon goal.

**Why.** "Cold email 20 people today" has a target, a unit and a deadline —
structurally identical to a decade goal. Splitting them into two tables would
mean two rollup implementations, two sets of policies, and a join at every level
of the recursion for no gain.

---

## 003 — Contribution weights sum to ≤ 1.0 per child

**Decision.** A goal's outgoing `contributes_to` weights are constrained to sum
to at most 1.0, enforced by trigger.

**Why.** This is what makes the DAG mathematically sound. Without it, a task
linked to two parents contributes its full effort to each, and every ancestor
total inflates. The constraint turns multi-parent links into a *split* of effort
rather than a duplication of it.

---

## 004 — Effort rolls up infinitely; outcomes roll up 1–2 hops

**Decision.** Hours propagate up the entire chain. Outcome quantities propagate
only across edges with declared, adjacent units. Long-horizon outcomes (yearly
revenue, decade net worth) are entered directly by the user at review time.

**Why.** Hours are hours — they sum with zero conversion error. Outcome
conversions (replies→clients→revenue→net worth) each carry an assumption with
error, and error compounds multiplicatively. Five hops at ±30% each produces a
number indistinguishable from noise. Presenting that as "6.2% complete" would be
false precision, which is the exact failure this project exists to avoid.

**Consequence.** The long-horizon view shows two independent series: effort
invested (exact) and outcome achieved (measured). Their divergence is the
signal — high effort against a flat outcome means the strategy is wrong, which
no blended percentage would ever reveal.

---

## 005 — Conversion factors are flagged, never auto-applied

**Decision.** When observed data contradicts a declared conversion factor, the
app surfaces the discrepancy and offers a one-click update. It never silently
recalibrates.

**Why.** Silent recalibration makes past projections unreproducible — you could
never answer "was I on track in March?" because the model would have changed
underneath you. Explicit acceptance keeps every forecast auditable and turns
business assumptions into scored predictions.

---

## 006 — Goal revisions are append-only

**Decision.** Every change to a target, deadline or status is logged to
`goal_revisions`. Pace is computed against the revision active at the time being
evaluated.

**Why.** Silently editing a deadline makes you retroactively "on track". Without
a revision log the system becomes a machine for flattering the user. With one,
moving a goalpost is legitimate *and* visible — the drift report shows how often
and in which direction.

---

## 007 — Three adherence numbers, never one composite

**Decision.** Coverage, fidelity and allocation are reported separately.

**Why.** They are orthogonal. 100% coverage with 20% fidelity means you tracked
everything and followed none of it. 95% fidelity with poor allocation means you
executed a plan pointed at the wrong things. Any weighted blend of the three
destroys the information that makes them actionable.

---

## 008 — Scheduling runs on Supabase pg_cron, not Vercel Cron

**Decision.** Recurring jobs (calendar sync, nudge engine) are scheduled with
`pg_cron` + `pg_net` calling Edge Functions.

**Why.** Vercel's Hobby plan rejects any cron more frequent than daily —
`*/15 * * * *` fails at deploy time, not at runtime. The nudge engine needs
15-minute granularity. `pg_cron` runs at any interval on Supabase's free tier.

**Consequence.** Moving to Vercel Pro later would only swap the trigger; the
Edge Functions are unchanged.

---

## 009 — Calendar sync polls; it does not use push webhooks

**Decision.** Incremental `syncToken` polling every 10 minutes.

**Why.** Google's watch channels expire and have no auto-renewal mechanism, and
push delivery requires domain verification. For one user, 10-minute polling is
indistinguishable from real-time and eliminates an entire class of "the webhook
silently stopped three weeks ago" failure.

---

## 010 — Email + password auth, no public sign-up

**Decision.** `signInWithPassword`, account created manually in the Supabase
dashboard.

**Why.** Magic links depend on email delivery, and Supabase's built-in SMTP is
rate limited on the free tier — a login that can fail because of an email quota
is a bad failure mode for the one person who uses this. No sign-up route means
no account-enumeration surface and no risk of a stranger creating an account.

---

## 011 — Metrics are SQL, never TypeScript

**Decision.** Every metric is a Postgres view or function, read by both the app
and the Edge Functions.

**Why.** The Telegram bot and the dashboard must never disagree about your
adherence number. Two implementations of the same formula will diverge —
usually at the edges (timezone boundaries, empty windows, division by zero) —
and there is no way to tell which one is lying.

---

## 012 — Dark theme only

**Decision.** No light palette, no theme toggle.

**Why.** Halves the styling surface of every component and removes an entire
category of contrast bugs. The user asked for Notion dark specifically.

---

## 013 — Revisions are written by a trigger, with the reason passed through a GUC

**Decision.** An `after update` trigger on `goals` writes `goal_revisions` for
any change to `target_value`, `due_date` or `status`. The optional reason reaches
it through a transaction-local setting (`synapse.revision_reason`) that
`update_goal_targets()` sets before its update and clears after.
`goal_revisions` has a select policy and nothing else, so only the trigger — which
is `security definer` — can write it.

**Why.** The reason is a property of the edit, not of the row, so there is
nowhere in the row to put it and a trigger cannot see a function argument. The
obvious alternative, writing the revision from the server action, was rejected
because it makes the log only as complete as the code paths that remember to
call it: a direct `update goals` from a script, a migration or the SQL editor
would silently skip it, and the whole value of the log is that it has no gaps.
Doing it in the trigger means every write is recorded and the ones that came
through the RPC simply carry more context. Having no insert policy is what makes
"append-only" a property of the schema rather than a convention.

---

## 014 — Acyclicity is enforced per link type, not across types

**Decision.** The cycle check on `goal_links` walks only edges of the same
`link_type` as the row being inserted. `relates_to` is not checked at all.

**Why.** The two recursions that must terminate traverse one edge type each: the
effort rollup follows `contributes_to`, the critical path follows `depends_on`.
A loop that alternates between them is not a loop for either, so rejecting it
would refuse legitimate graphs — a goal can reasonably block something that also
feeds it. `relates_to` carries no maths and is never traversed, so a cycle there
is free.

---

## 015 — achieved_rate is a bias-corrected EWMA, not a recursive one

**Decision.** `goal_pace` computes the achieved rate as a normalised weighted
mean: each day's weight is `(1 − α)` raised to its age in days, divided by the
sum of those weights. Supersedes the recursive form seeded with the first
observation, which shipped in `20260817090000` and was replaced the same day by
`20260817140000`.

**Why.** Seeding the recursion with the first value gives that sample a weight of
1 while every later one is weighted α. Over a long series the seed decays away
and the difference is invisible, but the series here are short — a week-horizon
goal has seven points — and the seed never washes out. The result was a metric
that ran backwards: with a three-day half-life, ten emails sent three days ago
reported 6.3/day while the same ten sent today reported 2.1/day. A user who
stopped working looked faster than one who had just started.

`achieved_rate` divides into `pace_ratio`, which the dashboard renders and the
Phase 5 nudge engine reads, so the error would have propagated into advice.
Dividing by the sum of weights makes a day's influence depend on its age and
nothing else, and a constant series returns that constant exactly.

Caught by a unit test asserting only that recent work should outweigh stale work
— worth remembering that the fixture which found this was the cheapest one in
the file.

---

## 016 — Planned and actual are separate rows, not columns

**Decision.** `time_slots` carries a `kind` enum (`planned | actual`) and a
primary key of `(user_id, slot_start, kind)`. Supersedes the sketch in an earlier
draft of `SCHEMA.md`, which had one row per instant with `planned_category_id`,
`planned_goal_id`, `actual_category_id` and `actual_goal_id` side by side.

**Why.** Both shapes can store both facts, so the argument is about what each one
makes *easy to get wrong*. The wide row invites `update time_slots set
actual_goal_id = planned_goal_id` at day close, which is the one write that must
never happen silently: the divergence between plan and actual is the entire
planning-bias metric, and once the plan has been overwritten there is no way to
recover it or even to detect that it happened. With two rows, "the plan was
replaced by what happened" is not an update at all — it is a delete plus an
insert, which nobody writes by accident.

It also makes the sparse-storage property exact. A day where you planned nothing
and logged six slots stores six rows, not six rows with four null columns each,
and `count(*) filter (where kind = 'actual')` is the honest expression of "how
much did I log".

**Consequences.** `get_day_grid()` has to join the table to itself to present the
two kinds side by side, which is where the wide row would have been simpler. That
cost is paid once, in one function, and every caller reads the joined shape.

The `source` column from the same draft (`manual|timer|gcal|carryover`) was
dropped rather than carried over: nothing in this phase reads it, and Phase 4 can
add it in its own migration when calendar sync actually needs to distinguish
provenance.

---

## 017 — Fidelity is judged at the granularity it was planned

**Decision.** A planned slot counts as honoured when the actual at the same
instant matches what was committed to, at the level it was committed to: a
planned *goal* must be matched by the same goal; a planned *category* with no
goal must be matched by the same category; a plan with neither is honoured by any
logged actual.

**Why.** The two obvious uniform rules are both wrong in one direction. Judging
everything on the goal marks a kept promise as broken — you blocked an hour for
"Deep Work" without naming a goal, spent it on Deep Work against a goal, and the
metric says you failed. Judging everything on the category marks a broken promise
as kept — you committed the hour to *this* goal specifically, worked a different
goal in the same category, and the metric says you succeeded.

Matching the granularity of the commitment is the only rule that never does
either. It also gives the user a real lever: planning at category level is a
looser promise than planning at goal level, and they can choose which they are
making.

**Consequence.** Fidelity is not comparable across days whose plans were written
at different granularities. That is honest rather than convenient — a day planned
loosely genuinely was a looser commitment — and it is why fidelity is never
blended with coverage into a single adherence score. See ADR 007.

---

## 018 — The day grid is as long as the day really is

**Decision.** `get_day_grid()` generates from local midnight to the next local
midnight, stepping an absolute 15 minutes. It returns 96 rows on an ordinary day
and 92 or 100 across a DST transition.

**Why.** The alternative — always emitting 96 slots from local midnight — is
tempting because 96 is a constant the UI would like to rely on. But a
spring-forward day has 23 hours in it, so the 96th slot would land at 01:00 the
next morning, and every slot after the transition would be labelled with a
wall-clock time an hour off. A fall-back day would silently drop an hour that
genuinely happened. Either way the coverage denominator is wrong on exactly two
days a year, in a way nobody notices until they are trying to explain a number.

The user's timezone is `Asia/Kolkata`, which has never observed DST, so this is
unobservable in production today. It is enforced anyway because the function must
not assume a timezone it was not told about — `profiles.timezone` is
user-editable, and the assumption would be invisible until the day it broke.

**Consequences.** No client code may assume 96. The grid renders `rows.length`,
the coverage denominator comes from the same function, and both TypeScript and
SQL assertions pin the 92/100 cases (`America/New_York`, 2026-03-08 and
2026-11-01). Alignment survives the jump because every real DST offset is a whole
number of quarter hours; there is a test for that too, since the check constraint
would reject the rows outright if it ever stopped being true.
