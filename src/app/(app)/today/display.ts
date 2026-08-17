/**
 * Presentation helpers for the time ledger.
 *
 * Formatting and date convenience only — nothing here computes a metric.
 * Coverage, fidelity and planning bias are SQL; see docs/DECISIONS.md 011.
 */

import { DateTime } from "luxon";

import type { SlotKind } from "@/lib/supabase/types";

export const KIND_LABEL: Record<SlotKind, string> = {
  planned: "Plan",
  actual: "Actual",
};

/** Today's date in the user's timezone, which is rarely the server's. */
export function todayIn(timezone: string): string {
  return DateTime.now().setZone(timezone).toISODate()!;
}

/** A validated `YYYY-MM-DD`, or null. Guards the `?date=` search param. */
export function normaliseDate(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const parsed = DateTime.fromISO(value);
  return parsed.isValid ? parsed.toISODate() : null;
}

export function shiftDate(date: string, days: number): string {
  return DateTime.fromISO(date).plus({ days }).toISODate()!;
}

/** "Today", "Yesterday", "Tomorrow", or "Tue 10 Mar 2026". */
export function dayLabel(date: string, timezone: string): string {
  const diff = DateTime.fromISO(date).diff(
    DateTime.fromISO(todayIn(timezone)),
    "days",
  ).days;

  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return DateTime.fromISO(date).toFormat("ccc d LLL yyyy");
}

export function fullDate(date: string): string {
  return DateTime.fromISO(date).toFormat("cccc d LLLL yyyy");
}

/** `HH:mm` from the `HH:mm:ss` a Postgres `time` column returns. */
export function clockLabel(localTime: string): string {
  return localTime.slice(0, 5);
}

/** Hours, trimmed: 2 rather than 2.00, 1.25 rather than 1.3. */
export function formatHours(hours: number): string {
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(hours)} h`;
}

/**
 * A ratio as a percentage, or an em dash when there is no ratio.
 *
 * Null here always means the metric is undefined rather than zero — a day with
 * no plan has a fidelity of nothing. Rendering it as 0% or 100% would be a
 * fabricated number, which hard rule 8 forbids.
 */
export function formatRatio(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

/** Signed hours, for the planning-bias column. */
export function formatBias(hours: number): string {
  const sign = hours > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(hours)}`;
}
