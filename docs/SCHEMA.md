# Schema

Current state plus the reasoning behind it. Update this alongside every
migration.

## Applied

### `notion_color` (enum)

`gray | brown | orange | yellow | green | blue | purple | pink | red`

The Notion palette, shared by categories now and goals in Phase 1. An enum
rather than a check constraint so it can be referenced from multiple tables
without repetition.

### `profiles`

One row per user, created automatically by `handle_new_user()`.

| Column | Notes |
|---|---|
| `id` | FK to `auth.users`, cascade delete |
| `timezone` | IANA name. Slots are UTC; this projects them onto the local day. |
| `waking_start` / `waking_end` | The **denominator of coverage**. Time outside is not expected to be logged. |
| `ewma_half_life_days` | Parameterises every EWMA in the app. 1–90. |
| `quiet_hours_start` / `quiet_hours_end` | Nudge suppression window. |
| `telegram_chat_id` | Set in Phase 5. |
| `currency` | Default INR. |

`waking_window_valid` requires `waking_start < waking_end`. Overnight waking
windows are unsupported **deliberately** — they make "which day does this slot
belong to" ambiguous, and that ambiguity would propagate into every adherence
figure in the system.

### `categories`

Time categories, seeded with ten defaults on sign-up.

`is_productive` separates intentional investment from maintenance and leisure.
It feeds the allocation metric and is not a moral judgement — sleep is marked
productive.

Archived via `archived_at`, never deleted: historical `time_slots` reference
them, and deleting would silently rewrite past adherence numbers.

### Shared

- `set_updated_at()` — trigger function; `updated_at` is maintained by the
  database, never trusted from the client.
- `handle_new_user()` — `security definer` trigger on `auth.users` creating the
  profile and seeding categories, so the app never encounters a half-initialised
  account.

---

## Applied — Phase 1 (`20260817090000`, `20260817140000`)

### `goals`

One table for every horizon. A "task" is `horizon = 'day'`.

```
id, user_id, horizon(day|week|month|quarter|year|decade),
title, description, color,
metric_unit, target_value,
start_date, due_date,
status(active|done|abandoned|blocked),
created_at, updated_at
unique (id, user_id)
```

There is no `current_value`. Progress is the `goal_progress` series and current
value is a sum over it — storing it as well would create a second source of
truth that drifts the first time a progress row is edited.

`unique (id, user_id)` is redundant against the primary key and exists only so
the three dependent tables can carry a composite foreign key. Without it a user
could reference someone else's `goal_id` while passing their own `user_id`, which
RLS alone does not catch.

### `goal_links`

The edges. This table is the model.

```
parent_id, child_id, user_id,
link_type(contributes_to|depends_on|relates_to),
contribution_weight numeric,   -- fraction of CHILD's effort going to this parent
conversion_factor numeric,     -- child units -> parent units, nullable
conversion_note text
primary key (parent_id, child_id, link_type)
foreign key (parent_id, user_id) -> goals (id, user_id)
foreign key (child_id,  user_id) -> goals (id, user_id)
```

**Orientation.** `parent_id` is always the upstream end. For `contributes_to`
that is the longer-horizon goal; for `depends_on` it is the *prerequisite*, and
`child_id` is the goal it blocks. Keeping one meaning for "parent" lets a single
ancestor walk serve both.

`conversion_factor` is null-only on non-`contributes_to` links, enforced by
check constraint — a conversion on a `depends_on` edge would be silently ignored,
which is worse than being rejected.

Three triggers carry the integrity of the whole system:

- **Acyclicity** (`SY001`) — an ancestry check on insert/update, per link type.
  A cycle would make the effort rollup non-terminating, so this is not optional.
  See ADR 014 for why it is per type.
- **Weight sum** (`SY002`) — a child's outgoing `contributes_to` weights must
  total ≤ 1.0. This is what turns a multi-parent link into a *split* of effort
  rather than a duplication, and it is the single constraint keeping ancestor
  totals honest. A constraint trigger, so a rebalancing transaction can defer it;
  takes an advisory lock on the child so two concurrent inserts cannot both pass.
- **Revision log** — on `goals`, not `goal_links`. See ADR 013.

`contribution_weight` is `numeric` rather than `double precision` specifically so
`0.7 + 0.3` is exactly `1.0` and the budget check needs no epsilon.

### `goal_revisions`

Append-only log of changes to target, deadline and status, with an optional
reason. Pace is evaluated against the revision active at the time in question, so
editing a decade goal today does not rewrite whether you were on track in March.

Append-only is enforced by the absence of policies: the table has a select policy
and nothing else, and only the `security definer` trigger writes it.

### `goal_progress`

`(goal_id, date, value)` — the outcome time series, kept separate from effort.

**`value` is the increment achieved on that date, not a running total.**
Cumulative progress is a sum over rows; the daily figure is what the EWMA
smooths. Negatives are legal — net worth can fall.

### Functions

| Function | Purpose |
|---|---|
| `goal_own_hours(goal_id)` | Hours logged directly against a goal. Returns 0 until Phase 2 — **the only thing Phase 2 changes.** |
| `goal_effort_shares(goal_id)` | Each descendant and the fraction of its effort reaching this goal. One row per *path*, weights multiplied along it, summed over paths — that is what makes a diamond come out at exactly 1.0 instead of half. |
| `goal_effort_rollup(goal_id)` | `Σ own_hours × share`. Unbounded depth. |
| `goal_outcome_rollup(goal_id, max_depth)` | Bounded depth, conversion-aware. Returns the value **and** every subtree it refused to sum, with a reason. Applies contribution weight as well as conversion: if 70% of a goal is allocated to a parent, 70% of its outcome counts toward it. |
| `goal_pace(goal_id, as_of)` | Revision-aware; correct for any historical date. `achieved_rate` is a bias-corrected EWMA — see ADR 015. |
| `goal_ancestry(goal_id)` | Every `contributes_to` edge above a goal, with accumulated share and a flag for undeclared unit boundaries. The visualiser's single query. |
| `blocked_goals()` | Goals with incomplete `depends_on` dependencies. |
| `critical_path(goal_id)` | Longest dependency chain; flags structurally unachievable deadlines. |
| `update_goal_targets(...)` | The only write path for target, deadline and status. Security invoker; exists to attach a reason to the revision. |

### Views

Both are declared `with (security_invoker = on)`. Without it a view runs as its
owner and returns every user's rows while each underlying table policy stays
perfectly correct — the one mistake available here that silently defeats all of
them, and there is an assertion for it in `supabase/tests/phase-1.sql`.

| View | Purpose |
|---|---|
| `goal_overview` | Goals plus progress total, parent/child counts and a blocked flag. |
| `goal_weight_budget` | How much of each goal's 1.0 contribution budget is allocated, so the link editor can show an over-allocation before the trigger has to reject it. |

---

## Applied — Phase 2 (`20260818090000`)

### `slot_kind` (enum)

`planned | actual`

### `time_slots`

```
user_id, slot_start timestamptz, kind slot_kind,
goal_id, category_id, note,
created_at, updated_at
primary key (user_id, slot_start, kind)
foreign key (goal_id, user_id) -> goals (id, user_id) on delete set null (goal_id)
```

**Two rows per instant, not one wide row.** An earlier sketch of this table put
`planned_*` and `actual_*` side by side in a single row. The `kind` enum replaced
it — see ADR 016. The practical consequence is that `primary key (user_id,
slot_start, kind)` allows exactly one planned and one actual slot per instant and
makes "the plan was overwritten by what happened" unrepresentable.

Constraint `slot_aligned`: `extract(epoch from slot_start)::bigint % 900 = 0`.
Every metric downstream counts rows and multiplies by 0.25, so a slot of any
other length is silent corruption of every hour figure in the system.

`on delete set null (goal_id)` names its column explicitly. Bare `on delete set
null` on a composite foreign key nulls *every* referencing column including
`user_id`, which is `NOT NULL` — so the unqualified form turns deleting a goal
into a constraint violation rather than a detachment. Detachment is the intent:
deleting a goal must not delete the record that the time was spent.

There is no index on `(user_id, slot_start)`; the primary key's index already
covers that prefix, and a second one would only add write amplification on the
hottest table in the app.

**Storage is sparse; reads are dense.** Only painted slots get rows (~35k/year at
full density — trivial). `get_day_grid(date)` uses `generate_series` to fill the
gaps, which turns "find unaccounted time" into a simple scan rather than proving
an absence.

This table is the join between the time ledger and the goal graph: every slot
links to a `goal_id` at any horizon, and that link is what makes effort rollup
return something other than zero.

### Functions

| Function | Purpose |
|---|---|
| `goal_own_hours(goal_id)` | **Rewritten this phase.** Actual slots against the goal × 0.25. Planned slots are excluded — intent is not effort. Nothing above it in the Phase 1 recursion changed. |
| `get_day_grid(date, user_id?)` | The dense day: one row per slot with planned and actual joined side by side, the local clock time, and the waking window already evaluated. |
| `day_coverage(date, user_id?)` | Logged slots over slots in the waking window. |
| `day_fidelity(date, user_id?)` | Planned slots honoured, over planned slots. Null when nothing was planned. |
| `planning_bias(from, to, user_id?)` | Planned versus actual hours per category over a range, including the uncategorised row. |

The optional `user_id` defaults to `auth.uid()`. It exists so the Phase 5 nudge
engine can read these definitions per user from an Edge Function rather than
reimplementing them — hard rule 1. It grants nothing: all four are security
invoker, so under a normal session RLS still filters `profiles` and `time_slots`
and passing another user's id returns nothing.

**`get_day_grid` does not always return 96 rows.** A day containing a DST
transition is genuinely 23 or 25 hours long, so it is 92 or 100 slots — see ADR
018. `Asia/Kolkata` has no DST, so the default profile always sees 96.

### The waking window

`profiles.waking_start`/`waking_end` are the **denominator of coverage**. Time
outside them is excluded from both sides of the ratio rather than counted as a
gap. Fidelity deliberately ignores the window: a commitment made for 06:00 is
still a commitment.
