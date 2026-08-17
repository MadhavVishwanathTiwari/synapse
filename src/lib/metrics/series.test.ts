import { describe, expect, it } from "vitest";

import {
  adherencePoints,
  effortKey,
  hasUnplannedDay,
  isolatedIndices,
  mergeDivergence,
  outcomeAxis,
  outcomeKey,
  toPercent,
  type GoalSeries,
} from "@/lib/metrics/series";
import {
  FIXTURE_ADHERENCE,
  FIXTURE_EFFORT_OUTCOME_B,
  FIXTURE_EFFORT_OUTCOME_D,
  GOAL_B,
  GOAL_D,
} from "@/lib/metrics/__fixtures__/phase-3";

describe("toPercent", () => {
  it("scales a ratio", () => {
    expect(toPercent(0.1875)).toBeCloseTo(18.75, 10);
  });

  it("passes null straight through", () => {
    // The whole reason this is a function. `(value ?? 0) * 100` is the version
    // people write inline, and it draws a 0% where the metric is undefined.
    expect(toPercent(null)).toBeNull();
  });
});

describe("adherencePoints", () => {
  it("returns one point per day, including days with nothing in them", () => {
    // A dropped row and a null row look identical in a chart and mean
    // completely different things. Three days in, three points out.
    const points = adherencePoints(FIXTURE_ADHERENCE);
    expect(points).toHaveLength(3);
    expect(points.map((p) => p.day)).toEqual([
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
    ]);
  });

  it("keeps fidelity null on a day with no plan, all the way to the chart", () => {
    /*
     * THE ASSERTION THIS FILE EXISTS FOR.
     *
     * supabase/tests/phase-3.sql proves the SQL returns null for 2026-03-11.
     * This proves the null survives the transformation that feeds the chart —
     * which is the step where it would actually be lost, and where the loss
     * would render as a line dropping to zero on a day nobody failed at.
     */
    const points = adherencePoints(FIXTURE_ADHERENCE);
    const unplanned = points.find((p) => p.day === "2026-03-11")!;

    expect(unplanned.fidelity).toBeNull();
    expect(unplanned.fidelity).not.toBe(0);
    // And its coverage is a real measurement on the same point, so the two
    // cannot be conflated by whatever renders them.
    expect(unplanned.coverage).toBeCloseTo(6.25, 10);
  });

  it("distinguishes a logged zero from an undefined metric", () => {
    const points = adherencePoints(FIXTURE_ADHERENCE);
    const empty = points.find((p) => p.day === "2026-03-12")!;

    // Nothing was logged: coverage is genuinely zero, and the window existed.
    expect(empty.coverage).toBe(0);
    expect(empty.expected).toBe(64);
    // Nothing was planned: fidelity is undefined, which is not the same thing.
    expect(empty.fidelity).toBeNull();
  });

  it("carries the denominators through for the tooltip", () => {
    const first = adherencePoints(FIXTURE_ADHERENCE)[0];
    expect(first.logged).toBe(12);
    expect(first.expected).toBe(64);
    expect(first.honoured).toBe(4);
    expect(first.planned).toBe(4);
  });
});

describe("hasUnplannedDay", () => {
  it("detects the gap so the chart can explain it", () => {
    expect(hasUnplannedDay(FIXTURE_ADHERENCE)).toBe(true);
    expect(hasUnplannedDay([FIXTURE_ADHERENCE[0]])).toBe(false);
  });
});

describe("isolatedIndices", () => {
  it("finds the point a line chart would draw as nothing", () => {
    /*
     * The fixture's fidelity series: one value, then two nulls. A line needs two
     * adjacent points to draw a segment, so this series produces no geometry at
     * all — and with dots off it is invisible while its legend entry claims it
     * exists. Caught here rather than in a browser, where "no line" and "no
     * data" look identical.
     */
    const fidelity = adherencePoints(FIXTURE_ADHERENCE).map((p) => p.fidelity);
    expect(isolatedIndices(fidelity)).toEqual(new Set([0]));
  });

  it("leaves points that have a neighbour alone", () => {
    // These join up into a line, so they need no dot of their own.
    expect(isolatedIndices([1, 2, 3])).toEqual(new Set());
    expect(isolatedIndices([1, 2, null])).toEqual(new Set());
    expect(isolatedIndices([null, 2, 3])).toEqual(new Set());
  });

  it("marks every island in a sparse series", () => {
    // A user who planned two days in a month. Both are real measurements and
    // both would otherwise render as nothing.
    expect(isolatedIndices([5, null, 7, null, null, 9])).toEqual(
      new Set([0, 2, 5]),
    );
  });

  it("treats a lone point as isolated", () => {
    expect(isolatedIndices([4])).toEqual(new Set([0]));
    expect(isolatedIndices([])).toEqual(new Set());
    expect(isolatedIndices([null, null])).toEqual(new Set());
  });

  it("does not confuse a zero with a gap", () => {
    // 0 is a measurement; null is the absence of one. A truthiness check here
    // would mark the zeros as gaps and put dots in the wrong places.
    expect(isolatedIndices([0, null, 0])).toEqual(new Set([0, 2]));
    expect(isolatedIndices([0, 0])).toEqual(new Set());
  });
});

describe("mergeDivergence", () => {
  const seriesB: GoalSeries = {
    goalId: GOAL_B,
    title: "B middle",
    metricUnit: "units",
    rows: FIXTURE_EFFORT_OUTCOME_B,
  };
  const seriesD: GoalSeries = {
    goalId: GOAL_D,
    title: "D top",
    metricUnit: null,
    rows: FIXTURE_EFFORT_OUTCOME_D,
  };

  it("puts several goals on one time axis without merging their values", () => {
    const points = mergeDivergence([seriesB, seriesD]);
    expect(points).toHaveLength(3);

    const last = points[2];
    // Effort is hours for both, so both are readable together. The values stay
    // in separate keys: nothing is ever summed across goals.
    expect(last[effortKey(GOAL_B)]).toBe(1.0);
    expect(last[effortKey(GOAL_D)]).toBe(2.0);
  });

  it("keeps a goal's outcome null until its first measurement", () => {
    const points = mergeDivergence([seriesB]);
    expect(points[0][outcomeKey(GOAL_B)]).toBeNull();
    expect(points[1][outcomeKey(GOAL_B)]).toBe(3);
    // Carried forward as a step: nothing new was measured, so the total did not
    // change — which is different from it having fallen back to zero.
    expect(points[2][outcomeKey(GOAL_B)]).toBe(3);
  });

  it("handles a range where one series has data and the other has none", () => {
    // The brief's third required case. D has effort throughout and was never
    // measured; neither series is faked to match the other.
    const points = mergeDivergence([seriesB, seriesD]);
    for (const point of points) {
      expect(point[outcomeKey(GOAL_D)]).toBeNull();
    }
    expect(points[2][effortKey(GOAL_D)]).toBe(2.0);
  });

  it("sorts by day regardless of the order goals arrive in", () => {
    const points = mergeDivergence([seriesD, seriesB]);
    expect(points.map((p) => p.day)).toEqual([
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
    ]);
  });
});

describe("outcomeAxis", () => {
  it("draws an axis when one unit is in play", () => {
    expect(outcomeAxis(["units"])).toEqual({ kind: "single", unit: "units" });
    expect(outcomeAxis(["INR", "INR"])).toEqual({ kind: "single", unit: "INR" });
  });

  it("refuses an axis when the units differ", () => {
    // Two units on one axis is meaningless, and normalising them to a common
    // scale would make the chart look right while asserting a comparison the
    // data cannot support. ADR 004, hard rule 8.
    expect(outcomeAxis(["INR", "people"])).toEqual({
      kind: "mixed",
      units: ["INR", "people"],
    });
  });

  it("ignores goals with no unit, which have no outcome series at all", () => {
    expect(outcomeAxis([null, "units", null])).toEqual({
      kind: "single",
      unit: "units",
    });
    expect(outcomeAxis([null, null])).toEqual({ kind: "none" });
    expect(outcomeAxis([])).toEqual({ kind: "none" });
  });
});
