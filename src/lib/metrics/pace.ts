/**
 * Pace: the rate a goal still needs versus the rate it is actually achieving.
 *
 * SQL counterpart: `public.goal_pace`. That is the definition the dashboard and
 * the nudge engine both read; this mirror exists to be unit-tested and must
 * follow it exactly, including which fields go null and in what order the status
 * is decided.
 *
 * Every division here is guarded. A pace ratio of Infinity renders as a number
 * and would be read as one, which is precisely the class of fabricated metric
 * this project exists to eliminate.
 */

import type { PaceStatus } from "@/lib/supabase/types";

export type PaceInput = {
  /** The target in effect on the evaluation date, not today's target. */
  targetValue: number | null;
  /** Sum of daily progress up to and including the evaluation date. */
  progressToDate: number;
  /** `due_date − as_of`, in days. May be zero or negative. */
  daysRemaining: number;
  /** EWMA of daily progress, or null when nothing has been logged. */
  achievedRate: number | null;
  /** Whether any progress row exists at all. */
  hasProgress: boolean;
};

export type PaceResult = {
  remaining: number | null;
  requiredRate: number | null;
  paceRatio: number | null;
  status: PaceStatus;
};

export function pace(input: PaceInput): PaceResult {
  const { targetValue, progressToDate, daysRemaining, achievedRate, hasProgress } =
    input;

  if (targetValue === null) {
    return {
      remaining: null,
      requiredRate: null,
      paceRatio: null,
      status: "unmeasured",
    };
  }

  const remaining = targetValue - progressToDate;

  // Statuses are decided in the same order as the SQL, and each one suppresses
  // the numbers that would be meaningless under it.
  let status: PaceStatus | null = null;
  if (remaining <= 0) {
    status = "complete";
  } else if (!hasProgress) {
    status = "no_data";
  } else if (daysRemaining <= 0) {
    status = "overdue";
  } else if (achievedRate === 0) {
    status = "stalled";
  }

  const requiredRate =
    remaining > 0 && daysRemaining > 0 ? remaining / daysRemaining : null;

  const paceRatio =
    requiredRate !== null && achievedRate !== null && achievedRate !== 0
      ? requiredRate / achievedRate
      : null;

  if (status === null) {
    // paceRatio is non-null here: reaching this branch requires a required rate
    // and a non-zero achieved rate.
    status =
      paceRatio! > 1.05 ? "behind" : paceRatio! < 0.95 ? "ahead" : "on_track";
  }

  return { remaining, requiredRate, paceRatio, status };
}
