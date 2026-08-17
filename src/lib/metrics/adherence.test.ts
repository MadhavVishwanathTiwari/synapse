import { describe, expect, it } from "vitest";

import type { AdherenceSlot } from "@/lib/metrics/adherence";
import {
  dayCoverage,
  dayFidelity,
  isHonoured,
} from "@/lib/metrics/adherence";
import {
  CAT_DEEP_WORK,
  CAT_LEARNING,
  EXPECTED_COVERAGE,
  EXPECTED_HONOURED,
  EXPECTED_IN_WINDOW,
  EXPECTED_LOGGED,
  EXPECTED_PLANNED,
  FIXTURE_DAY,
  GOAL_A,
} from "@/lib/metrics/__fixtures__/phase-2";

const EMPTY: AdherenceSlot = {
  inWakingWindow: true,
  hasPlanned: false,
  plannedGoalId: null,
  plannedCategoryId: null,
  hasActual: false,
  actualGoalId: null,
  actualCategoryId: null,
};

describe("dayCoverage", () => {
  it("reproduces the fixture day exactly", () => {
    // The same 10/64 asserted against day_coverage in supabase/tests/phase-2.sql,
    // so the mirror cannot drift from the authority.
    const result = dayCoverage(FIXTURE_DAY);
    expect(result.logged).toBe(EXPECTED_LOGGED);
    expect(result.expected).toBe(EXPECTED_IN_WINDOW);
    expect(result.coverage).toBe(EXPECTED_COVERAGE);
  });

  it("excludes slots outside the waking window from both sides", () => {
    // The 05:00 Sleep slot in the fixture. Counted, it would read 11/96.
    const outside = FIXTURE_DAY.filter((s) => !s.inWakingWindow && s.hasActual);
    expect(outside).toHaveLength(1);
    expect(dayCoverage(FIXTURE_DAY).logged).toBe(EXPECTED_LOGGED);
  });

  it("reports 0, not null, for a window with nothing logged", () => {
    // The window exists and none of it is accounted for. That is a real zero,
    // and it is a different claim from fidelity's null on the same day.
    const day = Array.from({ length: 64 }, () => ({ ...EMPTY }));
    expect(dayCoverage(day)).toEqual({ logged: 0, expected: 64, coverage: 0 });
  });

  it("reports null when the waking window is empty", () => {
    const day = Array.from({ length: 96 }, () => ({
      ...EMPTY,
      inWakingWindow: false,
    }));
    expect(dayCoverage(day).coverage).toBeNull();
  });

  it("counts a slot logged with neither goal nor category", () => {
    // "Something happened here and I don't want to classify it" is still an
    // account of the time.
    const day = [{ ...EMPTY, hasActual: true }];
    expect(dayCoverage(day).coverage).toBe(1);
  });

  it("handles a partially filled window with an exact ratio", () => {
    const day = Array.from({ length: 8 }, (_, i) => ({
      ...EMPTY,
      hasActual: i < 6,
    }));
    expect(dayCoverage(day)).toEqual({ logged: 6, expected: 8, coverage: 0.75 });
  });
});

describe("isHonoured", () => {
  it("judges a goal-level plan on the goal", () => {
    const slot: AdherenceSlot = {
      ...EMPTY,
      hasPlanned: true,
      plannedGoalId: GOAL_A,
      plannedCategoryId: CAT_DEEP_WORK,
      hasActual: true,
      actualGoalId: "some-other-goal",
      actualCategoryId: CAT_DEEP_WORK,
    };
    // Right category, wrong goal. The commitment named a goal, so it is a miss.
    expect(isHonoured(slot)).toBe(false);
  });

  it("judges a category-level plan on the category", () => {
    const slot: AdherenceSlot = {
      ...EMPTY,
      hasPlanned: true,
      plannedCategoryId: CAT_LEARNING,
      hasActual: true,
      actualGoalId: GOAL_A,
      actualCategoryId: CAT_LEARNING,
    };
    // Attaching a goal to time that was only committed at category level is not
    // a broken promise — judging it against the goal would say otherwise.
    expect(isHonoured(slot)).toBe(true);
  });

  it("counts any logged actual against an unclassified plan", () => {
    const slot: AdherenceSlot = { ...EMPTY, hasPlanned: true, hasActual: true };
    expect(isHonoured(slot)).toBe(true);
  });

  it("is a miss when nothing was logged at all", () => {
    const slot: AdherenceSlot = {
      ...EMPTY,
      hasPlanned: true,
      plannedCategoryId: CAT_LEARNING,
    };
    expect(isHonoured(slot)).toBe(false);
  });

  it("is never honoured without a plan", () => {
    expect(isHonoured({ ...EMPTY, hasActual: true, actualGoalId: GOAL_A })).toBe(
      false,
    );
  });
});

describe("dayFidelity", () => {
  it("reproduces the fixture day exactly", () => {
    // 5 of 7, matching day_fidelity in supabase/tests/phase-2.sql.
    const result = dayFidelity(FIXTURE_DAY);
    expect(result.planned).toBe(EXPECTED_PLANNED);
    expect(result.honoured).toBe(EXPECTED_HONOURED);
    expect(result.fidelity).toBe(EXPECTED_HONOURED / EXPECTED_PLANNED);
  });

  it("returns null when nothing was planned", () => {
    /*
     * The assertion the whole metric turns on. A day with no plan has a fidelity
     * of NOTHING: 1 would reward never planning and 0 would punish it, and both
     * are claims about a ratio with no denominator.
     */
    const day = Array.from({ length: 96 }, () => ({ ...EMPTY }));
    const result = dayFidelity(day);
    expect(result.planned).toBe(0);
    expect(result.fidelity).toBeNull();
    expect(result.fidelity).not.toBe(1);
    expect(result.fidelity).not.toBe(0);
  });

  it("returns 0, not null, for a plan that was wholly ignored", () => {
    // There was a denominator here, and the answer is genuinely zero.
    const day = [{ ...EMPTY, hasPlanned: true, plannedCategoryId: CAT_LEARNING }];
    expect(dayFidelity(day).fidelity).toBe(0);
  });

  it("ignores the waking window", () => {
    // A commitment made for 06:00 is still a commitment, even though coverage
    // would not count that slot.
    const day = [
      {
        ...EMPTY,
        inWakingWindow: false,
        hasPlanned: true,
        plannedCategoryId: CAT_LEARNING,
        hasActual: true,
        actualCategoryId: CAT_LEARNING,
      },
    ];
    expect(dayFidelity(day)).toEqual({ planned: 1, honoured: 1, fidelity: 1 });
  });

  it("is independent of coverage", () => {
    /*
     * The property docs/DECISIONS.md 007 exists to protect: a day can be fully
     * planned and perfectly followed while most of the window is unaccounted
     * for. Any blend of the two numbers would hide that.
     */
    const day = Array.from({ length: 64 }, (_, i) =>
      i < 4
        ? {
            ...EMPTY,
            hasPlanned: true,
            plannedCategoryId: CAT_LEARNING,
            hasActual: true,
            actualCategoryId: CAT_LEARNING,
          }
        : { ...EMPTY },
    );
    expect(dayFidelity(day).fidelity).toBe(1);
    expect(dayCoverage(day).coverage).toBe(0.0625);
  });
});
