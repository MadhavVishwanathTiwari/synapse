import { describe, expect, it } from "vitest";

import { pace } from "@/lib/metrics/pace";

/** The fixture asserted against goal_pace in supabase/tests/phase-1.sql. */
const BEHIND = {
  targetValue: 100,
  progressToDate: 10,
  daysRemaining: 9,
  achievedRate: 5,
  hasProgress: true,
};

describe("pace", () => {
  it("reproduces the hand-computed fixture", () => {
    const result = pace(BEHIND);
    expect(result.remaining).toBe(90);
    expect(result.requiredRate).toBe(10);
    expect(result.paceRatio).toBe(2);
    expect(result.status).toBe("behind");
  });

  it("does not divide by a zero achieved rate", () => {
    const result = pace({ ...BEHIND, achievedRate: 0 });
    expect(result.paceRatio).toBeNull();
    expect(result.paceRatio).not.toBe(Infinity);
    expect(result.status).toBe("stalled");
  });

  it("does not divide by zero days remaining", () => {
    const result = pace({ ...BEHIND, daysRemaining: 0 });
    expect(result.requiredRate).toBeNull();
    expect(result.paceRatio).toBeNull();
    expect(result.status).toBe("overdue");
  });

  it("treats a passed deadline as overdue, not negative-rate", () => {
    const result = pace({ ...BEHIND, daysRemaining: -3 });
    expect(result.requiredRate).toBeNull();
    expect(result.status).toBe("overdue");
  });

  it("reports no_data rather than a zero rate when nothing is logged", () => {
    const result = pace({
      ...BEHIND,
      achievedRate: null,
      hasProgress: false,
    });
    expect(result.status).toBe("no_data");
    expect(result.paceRatio).toBeNull();
  });

  it("reports unmeasured when there is no target", () => {
    const result = pace({ ...BEHIND, targetValue: null });
    expect(result.status).toBe("unmeasured");
    expect(result.remaining).toBeNull();
    expect(result.requiredRate).toBeNull();
    expect(result.paceRatio).toBeNull();
  });

  it("reports complete once the target is met", () => {
    expect(pace({ ...BEHIND, progressToDate: 100 }).status).toBe("complete");
    expect(pace({ ...BEHIND, progressToDate: 140 }).status).toBe("complete");
  });

  it("prefers complete over overdue when the target was met late", () => {
    // Hitting the number after the deadline is still hitting the number.
    const result = pace({
      ...BEHIND,
      progressToDate: 100,
      daysRemaining: -5,
    });
    expect(result.status).toBe("complete");
  });

  it("reports ahead when the achieved rate outpaces the requirement", () => {
    expect(pace({ ...BEHIND, achievedRate: 20 }).status).toBe("ahead");
  });

  it("allows a dead band around parity", () => {
    // required 10, achieved 10 -> ratio 1.0, which is neither behind nor ahead.
    expect(pace({ ...BEHIND, achievedRate: 10 }).status).toBe("on_track");
  });

  it("handles a falling metric without inventing a status", () => {
    // Net worth can go down: progress is negative, so more remains than the
    // target itself. That is 'behind', not an error.
    const result = pace({
      ...BEHIND,
      progressToDate: -20,
      achievedRate: 1,
    });
    expect(result.remaining).toBe(120);
    expect(result.status).toBe("behind");
  });
});
