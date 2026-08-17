/**
 * Presentation for the dashboard.
 *
 * Formatting, wording and date convenience only — nothing here computes a
 * metric. Every figure on this page arrives from a SQL function; anything in
 * this file that looks like arithmetic is a date shift or a unit label.
 *
 * THE UNDEFINED SENTENCES ARE THE POINT OF THIS MODULE. Hard rule 8 forbids
 * fabricating a metric, and the failure mode on a dashboard is not an invented
 * number so much as an em dash where an explanation belongs. A reader who sees
 * "—" learns nothing and assumes a bug; a reader who sees "nothing was planned"
 * learns the actual state of their own data. Deciding that wording once, here,
 * is the same move `PACE_SENTENCE` made for pace in Phase 1.
 */

import { DateTime } from "luxon";

/* -------------------------------------------------------------------- range */

/** The ranges the filter row offers. 30 days is the default. */
export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = 30;

export function normaliseRange(value: string | string[] | undefined): Range {
  const n = Number(typeof value === "string" ? value : NaN);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : DEFAULT_RANGE;
}

/**
 * The first day of a range ending today, inclusive of both ends — so a 30-day
 * range is today and the 29 days before it, not 30 days plus today.
 */
export function rangeStart(today: string, days: Range): string {
  return DateTime.fromISO(today).minus({ days: days - 1 }).toISODate()!;
}

export const RANGE_LABEL: Record<Range, string> = {
  7: "7 days",
  30: "30 days",
  90: "90 days",
};

/**
 * How many goals the divergence chart will draw at once.
 *
 * IT LIVES HERE, not beside the chart, because the server component reads it
 * too — and a plain constant exported from a `"use client"` module does not
 * survive that import. The bundler turns every export of a client module into a
 * client reference, so the server gets an opaque object where it expected `4`;
 * `array.slice(0, thatObject)` then coerces to NaN and silently returns an empty
 * array. That shipped once: the goal picker defaulted correctly but every
 * explicit selection came back empty, with no error anywhere.
 *
 * Four is the palette limit — past four slots the series colours stop being
 * separable under colour blindness. See ADR 021.
 */
export const MAX_SELECTED = 4;

/* ---------------------------------------------------------------- formatting */

/**
 * A ratio as a percentage, or an em dash when the metric is undefined.
 *
 * Never call this without a sentence beside it saying which of the two happened.
 * The dash on its own is the failure this module exists to prevent.
 */
export function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

/**
 * The same, for a value the chart has already scaled to 0–100.
 *
 * Exists so no chart component rounds inline. The acceptance criterion for this
 * phase is that a grep of the dashboard directory finds no arithmetic outside
 * formatting, and the way that stops being true is one `Math.round` at a time.
 */
export function formatScaledPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

/** Hours, trimmed: 2 rather than 2.00, 1.25 rather than 1.3. */
export function formatHours(value: number | string | null): string {
  if (value === null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)} h`;
}

/** A bare number for a chart axis or a table cell. */
export function formatValue(value: number | string | null): string {
  if (value === null) return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n);
}

/** "10 Mar" — the axis tick and table row label. */
export function dayLabel(iso: string): string {
  return DateTime.fromISO(iso).toFormat("d LLL");
}

/** "Tue 10 Mar" — for a tooltip, where there is room to be unambiguous. */
export function longDayLabel(iso: string): string {
  return DateTime.fromISO(iso).toFormat("ccc d LLL");
}

/* ------------------------------------------------------------- the sentences */

/**
 * Why a metric has no value. One per undefined state in the Phase 2 and Phase 3
 * SQL, worded so the reader learns the state of their data rather than that
 * something went wrong.
 */
export const UNDEFINED_SENTENCE = {
  coverage:
    "Your waking window is empty, so there is nothing to measure coverage against.",
  fidelity:
    "Nothing was planned for this day. A day with no plan has a fidelity of nothing — not 0%, and not 100%.",
  allocation:
    "Nothing is logged in this range yet, so there are no hours to allocate.",
  bias:
    "Nothing was budgeted for this category, and you cannot be biased about a budget you never set.",
  outcome:
    "No progress has been entered against this goal in this range. That is not the same as progress of zero.",
} as const;

/** What each of the three headline numbers means, in one line. */
export const METRIC_SENTENCE = {
  coverage: "How much of your waking window is accounted for.",
  fidelity: "How much of the plan you followed.",
  allocation: "How much of the logged time went to a category you marked productive.",
} as const;

/**
 * The caveat that has to travel with allocation everywhere it appears.
 *
 * `is_productive` marks sleep as productive on purpose — it separates
 * intentional investment from maintenance and leisure, not good hours from bad
 * ones. Without this line the number reads as a grade, and a reader optimising
 * against it would be optimising against something the data never claimed.
 */
export const ALLOCATION_CAVEAT =
  "Not a score. Sleep and meals count as productive on purpose — this says where the hours went, not whether they were well spent.";

/** Where the empty states point the reader, since an empty dashboard is normal early on. */
export const NO_DATA = {
  adherence: "No days in this range have anything logged against them.",
  allocation: "No time is logged in this range.",
  bias: "Nothing was planned or logged in this range.",
  attention:
    "Nothing is overdue, stalled, behind pace, or waiting on an unfinished prerequisite.",
  divergence: "No goal has any effort or measured progress in this range.",
} as const;
