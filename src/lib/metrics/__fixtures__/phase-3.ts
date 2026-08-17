/**
 * Hand-computed fixtures for the Phase 3 metric mirrors.
 *
 * THE FIXTURE RANGE IS THE SAME ONE ASSERTED IN `supabase/tests/phase-3.sql`.
 * That is the point: the SQL is authoritative, and holding both to one set of
 * numbers turns a drift between them into a failing gate rather than a quiet
 * disagreement between the dashboard and the Telegram bot.
 *
 * 2026-03-10 to 2026-03-12 in Asia/Kolkata (+05:30, no DST ever), waking window
 * 07:00–23:00 — 64 of each day's 96 slots.
 *
 *   day          planned                    actual
 *   ----------------------------------------------------------------------
 *   2026-03-10   09:00–10:00  Deep Work     09:00–10:00  Deep Work, goal A
 *                             + goal A      13:00–14:00  Distraction
 *                                           20:00–21:00  no category at all
 *                → coverage 12/64 = 0.1875, fidelity 4/4 = 1
 *
 *   2026-03-11   nothing                    09:00–10:00  Deep Work, goal A
 *                → coverage 4/64 = 0.0625, fidelity NULL — never 0, never 1
 *
 *   2026-03-12   nothing                    nothing
 *                → coverage 0/64 = 0 (a real measurement), fidelity NULL
 *
 * Allocation over the whole range:
 *
 *   Deep Work        8 slots  2.0 h  productive       share 0.5
 *   Distraction      4 slots  1.0 h  NOT productive   share 0.25
 *   (uncategorised)  4 slots  1.0 h  NO FLAG AT ALL   share 0.25
 *   logged          16 slots  4.0 h                   productive share 0.5
 *
 * The uncategorised row is the case the phase brief singles out: logged time
 * with no productive flag either way. It counts towards the denominator and its
 * flag stays null, because "unclassified" and "unproductive" are different
 * claims.
 *
 * The goal graph is the Phase 1 diamond — D→B 1.0, D→C 1.0, B→A 0.5, C→A 0.5 —
 * so goal A's 2.0 h reaches B as 1.0 h and D as 2.0 h, counted once.
 */

import type { AllocationSlot } from "@/lib/metrics/allocation";
import type { AdherenceRow, EffortOutcomeRow } from "@/lib/metrics/series";

export const RANGE_FROM = "2026-03-10";
export const RANGE_TO = "2026-03-12";
export const FIXTURE_ZONE = "Asia/Kolkata";

export const CAT_DEEP_WORK = "cat-deep-work";
export const CAT_DISTRACTION = "cat-distraction";

export const GOAL_B = "goal-b";
export const GOAL_D = "goal-d";

/* ---------------------------------------------------------------- allocation */

function repeat<T>(value: T, times: number): T[] {
  return Array.from({ length: times }, () => value);
}

/** Sixteen logged slots: eight productive, four not, four with no flag at all. */
export const FIXTURE_SLOTS: AllocationSlot[] = [
  ...repeat<AllocationSlot>(
    { categoryId: CAT_DEEP_WORK, categoryName: "Deep Work", isProductive: true },
    8,
  ),
  ...repeat<AllocationSlot>(
    { categoryId: CAT_DISTRACTION, categoryName: "Distraction", isProductive: false },
    4,
  ),
  ...repeat<AllocationSlot>(
    { categoryId: null, categoryName: null, isProductive: null },
    4,
  ),
];

export const EXPECTED_LOGGED_HOURS = 4.0;
export const EXPECTED_PRODUCTIVE_HOURS = 2.0;
export const EXPECTED_UNPRODUCTIVE_HOURS = 1.0;
export const EXPECTED_UNCLASSIFIED_HOURS = 1.0;
export const EXPECTED_PRODUCTIVE_SHARE = 0.5;

export const EXPECTED_DEEP_WORK_SHARE = 0.5;
export const EXPECTED_DISTRACTION_SHARE = 0.25;
export const EXPECTED_UNCLASSIFIED_SHARE = 0.25;

/* ------------------------------------------------------------------ series */

/**
 * The adherence series exactly as `adherence_series` returns it — including the
 * middle day, which is present with a null fidelity rather than missing.
 */
export const FIXTURE_ADHERENCE: AdherenceRow[] = [
  {
    day: "2026-03-10",
    logged: 12,
    expected: 64,
    coverage: 0.1875,
    planned: 4,
    honoured: 4,
    fidelity: 1,
  },
  {
    day: "2026-03-11",
    logged: 4,
    expected: 64,
    coverage: 0.0625,
    planned: 0,
    honoured: 0,
    fidelity: null,
  },
  {
    day: "2026-03-12",
    logged: 0,
    expected: 64,
    coverage: 0,
    planned: 0,
    honoured: 0,
    fidelity: null,
  },
];

/** Goal B: 0.5 h a day through the diamond, one measurement on the middle day. */
export const FIXTURE_EFFORT_OUTCOME_B: EffortOutcomeRow[] = [
  {
    day: "2026-03-10",
    effort_hours: 0.5,
    cumulative_effort_hours: 0.5,
    outcome_value: null,
    cumulative_outcome: null,
  },
  {
    day: "2026-03-11",
    effort_hours: 0.5,
    cumulative_effort_hours: 1.0,
    outcome_value: 3,
    cumulative_outcome: 3,
  },
  {
    day: "2026-03-12",
    effort_hours: 0,
    cumulative_effort_hours: 1.0,
    outcome_value: null,
    cumulative_outcome: 3,
  },
];

/** Goal D: effort throughout, never measured. One series has data, one has none. */
export const FIXTURE_EFFORT_OUTCOME_D: EffortOutcomeRow[] = [
  {
    day: "2026-03-10",
    effort_hours: 1.0,
    cumulative_effort_hours: 1.0,
    outcome_value: null,
    cumulative_outcome: null,
  },
  {
    day: "2026-03-11",
    effort_hours: 1.0,
    cumulative_effort_hours: 2.0,
    outcome_value: null,
    cumulative_outcome: null,
  },
  {
    day: "2026-03-12",
    effort_hours: 0,
    cumulative_effort_hours: 2.0,
    outcome_value: null,
    cumulative_outcome: null,
  },
];
