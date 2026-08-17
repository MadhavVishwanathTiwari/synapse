/**
 * Presentation helpers shared by the goals screens.
 *
 * Formatting only — nothing here computes a metric. Anything that looks like
 * maths is either a label lookup or a date convenience.
 */

import { DateTime } from "luxon";

import type {
  GoalHorizon,
  GoalLinkType,
  GoalStatus,
  PaceStatus,
  UnsummedReason,
} from "@/lib/supabase/types";

export const HORIZON_LABEL: Record<GoalHorizon, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  quarter: "Quarter",
  year: "Year",
  decade: "Decade",
};

export const STATUS_LABEL: Record<GoalStatus, string> = {
  active: "Active",
  done: "Done",
  abandoned: "Abandoned",
  blocked: "Blocked",
};

export const LINK_TYPE_LABEL: Record<GoalLinkType, string> = {
  contributes_to: "Contributes to",
  depends_on: "Depends on",
  relates_to: "Related to",
};

/**
 * One sentence per pace status.
 *
 * The wording matters as much as the number: several of these states exist
 * precisely so the UI can avoid printing a ratio that would be meaningless, and
 * the sentence has to carry the meaning on its own.
 */
export const PACE_SENTENCE: Record<PaceStatus, string> = {
  unmeasured: "No target set, so there is no rate to compare against.",
  no_data: "No progress logged yet — pace needs at least one entry.",
  complete: "Target met.",
  overdue: "Past its deadline with work outstanding.",
  stalled: "Nothing logged recently, so there is no rate to project.",
  behind: "Behind the rate needed to finish on time.",
  on_track: "On the rate needed to finish on time.",
  ahead: "Ahead of the rate needed to finish on time.",
};

export const PACE_TONE: Record<PaceStatus, string> = {
  unmeasured: "text-text-tertiary",
  no_data: "text-text-tertiary",
  complete: "text-success",
  overdue: "text-danger",
  stalled: "text-warning",
  behind: "text-warning",
  on_track: "text-success",
  ahead: "text-success",
};

export const UNSUMMED_SENTENCE: Record<UnsummedReason, string> = {
  unit_mismatch:
    "Units differ across this link and no conversion factor is declared.",
  child_unmeasured: "This goal has no unit or target of its own.",
  depth_limit:
    "Beyond the two-hop limit. Long-horizon outcomes are entered directly, not derived.",
};

/** The last day of the period a horizon names, starting from `from`. */
export function horizonDefaultDue(horizon: GoalHorizon, from = DateTime.now()) {
  const end = {
    day: () => from.endOf("day"),
    week: () => from.endOf("week"),
    month: () => from.endOf("month"),
    quarter: () => from.endOf("quarter"),
    year: () => from.endOf("year"),
    // Luxon has no decade unit; ten years out is the honest reading.
    decade: () => from.plus({ years: 10 }).endOf("year"),
  }[horizon]();

  return end.toISODate() ?? from.toISODate()!;
}

export function today() {
  return DateTime.now().toISODate()!;
}

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  return DateTime.fromISO(iso).toFormat("d LLL yyyy");
}

export function formatShortDate(iso: string | null) {
  if (!iso) return "—";
  const date = DateTime.fromISO(iso);
  return date.year === DateTime.now().year
    ? date.toFormat("d LLL")
    : date.toFormat("LLL yyyy");
}

/**
 * Numbers for display. Trims trailing zeros so 0.70 reads as 0.7, and keeps
 * large figures readable without inventing precision.
 */
export function formatNumber(
  value: number | string | null | undefined,
  maximumFractionDigits = 2,
) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(n);
}

/** Weights always read as two decimals: 0.70, never 0.7, so columns align. */
export function formatWeight(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}
