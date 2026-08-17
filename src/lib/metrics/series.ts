/**
 * Turning the Phase 3 SQL series into the arrays a chart wants.
 *
 * NOTHING HERE COMPUTES A METRIC. `adherence_series` and `effort_outcome_series`
 * are authoritative; these functions relabel, merge and scale their rows for
 * rendering. That is why they take the database row shapes verbatim, snake_case
 * and all — a mapper that restated the columns in its own vocabulary would be a
 * place for a value to change meaning on the way past.
 *
 * THE ONE THING THIS FILE EXISTS TO GET RIGHT IS NULL.
 *
 * The SQL returns null where a metric is undefined: fidelity on a day with no
 * plan, outcome on a day with no entry. A chart library will happily interpolate
 * straight through a gap if the null is turned into a zero anywhere along the
 * way — and the resulting line asserts a measurement that was never taken. Every
 * function below preserves null, and the tests assert that it survives to the
 * shape the chart actually receives, not merely that the SQL returned it.
 *
 * So: no `?? 0` in this file, ever. If one appears, the phase has failed.
 */

/** `public.adherence_series` verbatim. */
export type AdherenceRow = {
  day: string;
  logged: number;
  expected: number;
  /** Null only when the waking window is empty. Zero is a real measurement. */
  coverage: number | null;
  planned: number;
  honoured: number;
  /** Null when nothing was planned that day. Not 0, and not 1. */
  fidelity: number | null;
};

/** `public.effort_outcome_series` verbatim. */
export type EffortOutcomeRow = {
  day: string;
  effort_hours: number;
  cumulative_effort_hours: number;
  /** Null when nothing was entered that day, which is not an entry of zero. */
  outcome_value: number | null;
  /** Null until the first measurement in the range. */
  cumulative_outcome: number | null;
};

/**
 * A ratio as a percentage for a 0–100 axis, preserving the undefined case.
 *
 * Scaling, not computation. The `null` branch is the entire reason this is a
 * function rather than an inline `* 100`: the obvious inline version is written
 * `(value ?? 0) * 100` about half the time, and that version is a lie.
 */
export function toPercent(value: number | null): number | null {
  return value === null ? null : value * 100;
}

export type AdherencePoint = {
  day: string;
  /** Coverage as a percentage, or null where the metric is undefined. */
  coverage: number | null;
  /** Fidelity as a percentage, or null on a day with no plan. */
  fidelity: number | null;
  /** Carried through so a tooltip can print the denominator beside the figure. */
  logged: number;
  expected: number;
  planned: number;
  honoured: number;
};

/** The adherence trend, one point per day, gaps intact. */
export function adherencePoints(
  rows: readonly AdherenceRow[],
): AdherencePoint[] {
  return rows.map((row) => ({
    day: row.day,
    coverage: toPercent(row.coverage),
    fidelity: toPercent(row.fidelity),
    logged: row.logged,
    expected: row.expected,
    planned: row.planned,
    honoured: row.honoured,
  }));
}

/** True when at least one day in the range has no plan, so the line will break. */
export function hasUnplannedDay(rows: readonly AdherenceRow[]): boolean {
  return rows.some((row) => row.fidelity === null);
}

/**
 * The indices of points that have no neighbour to be joined to.
 *
 * A line chart draws segments between adjacent points, so a value whose
 * neighbours are both null produces no segment at all — and with dots turned
 * off it renders as nothing. The series is then invisible while its legend
 * entry promises it is there, which is a worse failure than a missing line: the
 * reader concludes there is no data when in fact there is exactly one day of it.
 *
 * FOR THIS APP THAT IS THE NORMAL CASE, not an edge case. Fidelity is null on
 * every day with no plan, so a user who planned one day in a month has a
 * fidelity series of exactly one point. Those points get an explicit dot.
 */
export function isolatedIndices(
  values: readonly (number | null | undefined)[],
): Set<number> {
  const isolated = new Set<number>();

  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === null || values[i] === undefined) continue;

    const before = i > 0 ? values[i - 1] : null;
    const after = i < values.length - 1 ? values[i + 1] : null;

    if (
      (before === null || before === undefined) &&
      (after === null || after === undefined)
    ) {
      isolated.add(i);
    }
  }

  return isolated;
}

/* ---------------------------------------------------------------- divergence */

/** One goal's series, with the metadata the chart needs to label and axis it. */
export type GoalSeries = {
  goalId: string;
  title: string;
  /** Null when the goal has no unit, in which case it has no outcome series. */
  metricUnit: string | null;
  rows: readonly EffortOutcomeRow[];
};

/**
 * Recharts reads one flat array of objects, so several goals on one chart means
 * one key per goal per series. These two functions are the only place those keys
 * are spelled, so a rename cannot desynchronise the data from the `<Line>`s.
 */
export function effortKey(goalId: string): string {
  return `effort:${goalId}`;
}

export function outcomeKey(goalId: string): string {
  return `outcome:${goalId}`;
}

export type DivergencePoint = {
  day: string;
  /** `effort:<goalId>` in hours, `outcome:<goalId>` in the goal's own unit. */
  [key: string]: string | number | null;
};

/**
 * Merge several goals' series onto one time axis.
 *
 * Effort is cumulative hours, which every goal shares. Outcome is cumulative in
 * the goal's own unit and stays null until that goal's first measurement — see
 * `outcomeAxis` for why the units cannot simply be drawn together.
 */
export function mergeDivergence(
  series: readonly GoalSeries[],
): DivergencePoint[] {
  const byDay = new Map<string, DivergencePoint>();

  for (const goal of series) {
    for (const row of goal.rows) {
      let point = byDay.get(row.day);
      if (!point) {
        point = { day: row.day };
        byDay.set(row.day, point);
      }
      point[effortKey(goal.goalId)] = row.cumulative_effort_hours;
      // Null, deliberately and explicitly. A goal with no measurement in the
      // range contributes a column of nulls, and the line simply is not drawn.
      point[outcomeKey(goal.goalId)] = row.cumulative_outcome;
    }
  }

  return [...byDay.values()].sort((a, b) =>
    String(a.day).localeCompare(String(b.day)),
  );
}

/**
 * Whether the selected goals' outcomes can share one axis.
 *
 * Effort is hours for every goal, so effort lines always share the left axis.
 * Outcomes are in the user's own units — rupees, people, kilograms — and two
 * different units on one axis is meaningless. Normalising them to a common
 * scale would make the chart look right while asserting a comparison the data
 * cannot support, which is precisely what ADR 004 and hard rule 8 forbid.
 *
 * So the outcome axis is drawn only when exactly one unit is in play. Goals with
 * no unit have no outcome series at all and therefore do not constrain it.
 */
export type OutcomeAxis =
  | { kind: "none" }
  | { kind: "single"; unit: string }
  | { kind: "mixed"; units: string[] };

export function outcomeAxis(
  units: readonly (string | null)[],
): OutcomeAxis {
  const distinct = [...new Set(units.filter((u): u is string => u !== null))];
  if (distinct.length === 0) return { kind: "none" };
  if (distinct.length === 1) return { kind: "single", unit: distinct[0] };
  return { kind: "mixed", units: distinct.sort() };
}
