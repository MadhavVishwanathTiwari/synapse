import { describe, expect, it } from "vitest";

import {
  EWMA_END,
  EWMA_EXPECTED,
  EWMA_HALF_LIFE,
  EWMA_SERIES,
  EWMA_START,
} from "@/lib/metrics/__fixtures__/phase-1";
import { alphaFromHalfLife, densifyDaily, ewma } from "@/lib/metrics/ewma";

describe("alphaFromHalfLife", () => {
  it("halves a sample's weight after exactly one half-life", () => {
    const alpha = alphaFromHalfLife(7);
    expect(Math.pow(1 - alpha, 7)).toBeCloseTo(0.5, 12);
  });

  it("matches the closed form for a two-day half-life", () => {
    expect(alphaFromHalfLife(2)).toBe(1 - Math.SQRT1_2);
  });

  it("rejects a non-positive half-life", () => {
    expect(() => alphaFromHalfLife(0)).toThrow(RangeError);
  });
});

describe("ewma", () => {
  it("reproduces the hand-computed fixture exactly", () => {
    // Same series and half-life asserted against goal_pace in
    // supabase/tests/phase-1.sql, so the mirror cannot drift silently.
    expect(ewma(EWMA_SERIES, EWMA_HALF_LIFE)).toBe(EWMA_EXPECTED);
  });

  it("returns null rather than 0 for an empty series", () => {
    // A rate of zero and the absence of data are different claims.
    expect(ewma([], 7)).toBeNull();
  });

  it("returns the single value for a one-element series", () => {
    expect(ewma([42], 7)).toBe(42);
  });

  it("settles on a constant series", () => {
    expect(ewma([5, 5, 5, 5, 5, 5, 5, 5], 3)).toBeCloseTo(5, 12);
  });

  it("weights recent observations more than old ones", () => {
    // The regression this normalisation was introduced for: under the recursive
    // form seeded with the first value these came out the wrong way round, so a
    // burst of work three days ago outranked the same burst today.
    const recent = ewma([0, 0, 10], 3)!;
    const stale = ewma([10, 0, 0], 3)!;
    expect(recent).toBeGreaterThan(stale);
  });

  it("returns a value between the observations it averages", () => {
    const result = ewma([4, 1], 1)!;
    expect(result).toBeGreaterThan(1);
    expect(result).toBeLessThan(4);
  });
});

describe("densifyDaily", () => {
  it("fills absent days with real zeros", () => {
    const series = densifyDaily(
      [{ date: "2026-03-01", value: 10 }],
      "2026-03-01",
      "2026-03-03",
    );
    expect(series).toEqual([10, 0, 0]);
  });

  it("produces the fixture series the EWMA test consumes", () => {
    expect(
      densifyDaily(
        [
          { date: EWMA_START, value: 4 },
          { date: EWMA_END, value: 1 },
        ],
        EWMA_START,
        EWMA_END,
      ),
    ).toEqual(EWMA_SERIES);
  });

  it("sums duplicate entries for the same day", () => {
    const series = densifyDaily(
      [
        { date: "2026-03-01", value: 4 },
        { date: "2026-03-01", value: 6 },
      ],
      "2026-03-01",
      "2026-03-01",
    );
    expect(series).toEqual([10]);
  });

  it("ignores entries outside the window", () => {
    const series = densifyDaily(
      [
        { date: "2026-02-27", value: 99 },
        { date: "2026-03-02", value: 3 },
      ],
      "2026-03-01",
      "2026-03-03",
    );
    expect(series).toEqual([0, 3, 0]);
  });

  it("crosses a month boundary", () => {
    expect(densifyDaily([], "2026-02-27", "2026-03-02")).toHaveLength(4);
  });
});
