import { describe, expect, it } from "vitest";

import {
  DIAMOND_EDGES,
  DIAMOND_HOURS,
  DIAMOND_LEAF_SHARE,
  DIAMOND_ROLLUP,
} from "@/lib/metrics/__fixtures__/phase-1";
import { effortRollup, effortShares } from "@/lib/metrics/rollup";

describe("effortShares", () => {
  it("attributes a diamond's leaf exactly once", () => {
    const shares = effortShares("D", DIAMOND_EDGES);
    expect(shares.get("A")).toBe(DIAMOND_LEAF_SHARE);
  });

  it("does not deduplicate visited nodes, which would halve the leaf", () => {
    // Guards the specific wrong implementation: keeping only the first path to A
    // yields 0.5. Asserting what we are NOT is worth a test here, because the
    // dedup version passes every other assertion in this file.
    const shares = effortShares("D", DIAMOND_EDGES);
    expect(shares.get("A")).not.toBe(0.5);
  });

  it("gives the root a share of 1", () => {
    expect(effortShares("D", DIAMOND_EDGES).get("D")).toBe(1);
  });

  it("multiplies weights along a chain", () => {
    const shares = effortShares("top", [
      { parentId: "top", childId: "mid", weight: 0.5 },
      { parentId: "mid", childId: "leaf", weight: 0.5 },
    ]);
    expect(shares.get("leaf")).toBe(0.25);
  });

  it("returns only the root when it has no children", () => {
    const shares = effortShares("lonely", DIAMOND_EDGES);
    expect([...shares.entries()]).toEqual([["lonely", 1]]);
  });

  it("terminates on a cycle rather than hanging", () => {
    // The database rejects cycles, so this can only arise from a graph built in
    // memory — but a non-terminating rollup is not an acceptable failure mode.
    const shares = effortShares(
      "x",
      [
        { parentId: "x", childId: "y", weight: 1 },
        { parentId: "y", childId: "x", weight: 1 },
      ],
      4,
    );
    expect(shares.get("x")).toBeGreaterThan(0);
  });
});

describe("effortRollup", () => {
  it("totals the diamond's hours without double counting", () => {
    expect(effortRollup("D", DIAMOND_HOURS, DIAMOND_EDGES)).toBe(DIAMOND_ROLLUP);
  });

  it("splits a goal's hours between two parents", () => {
    // A's 10 hours, 0.5 to each of B and C, so each parent sees exactly 5.
    expect(effortRollup("B", DIAMOND_HOURS, DIAMOND_EDGES)).toBe(5);
    expect(effortRollup("C", DIAMOND_HOURS, DIAMOND_EDGES)).toBe(5);
  });

  it("is zero when nothing has logged hours", () => {
    const noHours = new Map<string, number>();
    expect(effortRollup("D", noHours, DIAMOND_EDGES)).toBe(0);
  });
});
