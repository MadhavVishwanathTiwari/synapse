/**
 * Hand-computed fixtures for the Phase 2 metric mirrors.
 *
 * THE FIXTURE DAY IS THE SAME ONE ASSERTED IN `supabase/tests/phase-2.sql`.
 * That is the point: the SQL is authoritative, and holding both to one set of
 * numbers turns a drift between them into a failing gate rather than a quiet
 * disagreement between the dashboard and the Telegram bot.
 *
 * 2026-03-10 in Asia/Kolkata (+05:30, no DST ever), waking window 07:00–23:00.
 *
 *   index  local          planned                    actual
 *   ----------------------------------------------------------------------
 *      20  05:00          —                          Sleep      (out of window)
 *   36–39  09:00–09:45    goal A + Deep Work         goal A + Deep Work   ✓
 *      40  10:00          Learning                   Learning             ✓
 *      41  10:15          Learning                   Distraction          ✗
 *   56–59  14:00–14:45    —                          goal A + Deep Work
 *      80  20:00          Gym                        —                    ✗
 *
 *   coverage  10 logged / 64 in window = 0.15625
 *   fidelity   5 honoured / 7 planned
 *
 * The waking window runs 07:00 to 23:00, which is indices 28 through 91: 64 of
 * the day's 96 slots.
 */

import type { AdherenceSlot } from "@/lib/metrics/adherence";

export const FIXTURE_DATE = "2026-03-10";
export const FIXTURE_ZONE = "Asia/Kolkata";
export const WAKING_START = "07:00";
export const WAKING_END = "23:00";

/** Local midnight IST is 18:30 UTC the previous day. */
export const FIXTURE_FIRST_SLOT = "2026-03-09T18:30:00Z";

export const GOAL_A = "goal-a";
export const CAT_DEEP_WORK = "cat-deep-work";
export const CAT_LEARNING = "cat-learning";
export const CAT_DISTRACTION = "cat-distraction";
export const CAT_SLEEP = "cat-sleep";
export const CAT_GYM = "cat-gym";

const EMPTY: AdherenceSlot = {
  inWakingWindow: false,
  hasPlanned: false,
  plannedGoalId: null,
  plannedCategoryId: null,
  hasActual: false,
  actualGoalId: null,
  actualCategoryId: null,
};

/** 07:00 is index 28; 23:00 is index 92, and the window is half-open. */
const WAKING_FROM = 28;
const WAKING_TO = 92;

function build(): AdherenceSlot[] {
  const day: AdherenceSlot[] = Array.from({ length: 96 }, (_, i) => ({
    ...EMPTY,
    inWakingWindow: i >= WAKING_FROM && i < WAKING_TO,
  }));

  const plan = (
    i: number,
    goalId: string | null,
    categoryId: string | null,
  ) => {
    day[i] = { ...day[i], hasPlanned: true, plannedGoalId: goalId, plannedCategoryId: categoryId };
  };

  const log = (i: number, goalId: string | null, categoryId: string | null) => {
    day[i] = { ...day[i], hasActual: true, actualGoalId: goalId, actualCategoryId: categoryId };
  };

  for (let i = 36; i <= 39; i += 1) {
    plan(i, GOAL_A, CAT_DEEP_WORK);
    log(i, GOAL_A, CAT_DEEP_WORK);
  }

  plan(40, null, CAT_LEARNING);
  log(40, null, CAT_LEARNING);

  plan(41, null, CAT_LEARNING);
  log(41, null, CAT_DISTRACTION);

  for (let i = 56; i <= 59; i += 1) log(i, GOAL_A, CAT_DEEP_WORK);

  plan(80, null, CAT_GYM);

  log(20, null, CAT_SLEEP);

  return day;
}

export const FIXTURE_DAY: AdherenceSlot[] = build();

export const EXPECTED_IN_WINDOW = 64;
export const EXPECTED_LOGGED = 10;
export const EXPECTED_COVERAGE = 0.15625;

export const EXPECTED_PLANNED = 7;
export const EXPECTED_HONOURED = 5;

/*
 * DST days, which Asia/Kolkata can never produce. US clocks go forward on
 * 2026-03-08 (a 23-hour day, 92 slots) and back on 2026-11-01 (25 hours, 100).
 */
export const DST_ZONE = "America/New_York";
export const DST_SPRING_FORWARD = "2026-03-08";
export const DST_SPRING_FORWARD_SLOTS = 92;
export const DST_FALL_BACK = "2026-11-01";
export const DST_FALL_BACK_SLOTS = 100;
