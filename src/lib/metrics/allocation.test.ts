import { describe, expect, it } from "vitest";

import type { AllocationSlot } from "@/lib/metrics/allocation";
import { allocation, allocationSummary } from "@/lib/metrics/allocation";
import {
  CAT_DEEP_WORK,
  CAT_DISTRACTION,
  EXPECTED_DEEP_WORK_SHARE,
  EXPECTED_DISTRACTION_SHARE,
  EXPECTED_LOGGED_HOURS,
  EXPECTED_PRODUCTIVE_HOURS,
  EXPECTED_PRODUCTIVE_SHARE,
  EXPECTED_UNCLASSIFIED_HOURS,
  EXPECTED_UNCLASSIFIED_SHARE,
  EXPECTED_UNPRODUCTIVE_HOURS,
  FIXTURE_SLOTS,
} from "@/lib/metrics/__fixtures__/phase-3";

describe("allocation", () => {
  it("reproduces the fixture range exactly", () => {
    // The same 2.0 / 1.0 / 1.0 asserted against public.allocation in
    // supabase/tests/phase-3.sql, so the mirror cannot drift from the authority.
    const rows = allocation(FIXTURE_SLOTS);
    expect(rows).toHaveLength(3);

    const deepWork = rows.find((r) => r.categoryId === CAT_DEEP_WORK)!;
    expect(deepWork.actualHours).toBe(EXPECTED_PRODUCTIVE_HOURS);
    expect(deepWork.isProductive).toBe(true);
    expect(deepWork.share).toBe(EXPECTED_DEEP_WORK_SHARE);

    const distraction = rows.find((r) => r.categoryId === CAT_DISTRACTION)!;
    expect(distraction.actualHours).toBe(EXPECTED_UNPRODUCTIVE_HOURS);
    expect(distraction.isProductive).toBe(false);
    expect(distraction.share).toBe(EXPECTED_DISTRACTION_SHARE);
  });

  it("keeps logged time that has no productive flag either way", () => {
    /*
     * The case the phase brief singles out. Dropping this row would make the
     * shares fail to sum to the range; reporting it as `isProductive: false`
     * would invent a judgement that was never recorded. It is neither.
     */
    const rows = allocation(FIXTURE_SLOTS);
    const unclassified = rows.find((r) => r.categoryId === null)!;

    expect(unclassified).toBeDefined();
    expect(unclassified.isProductive).toBeNull();
    expect(unclassified.categoryName).toBeNull();
    expect(unclassified.actualHours).toBe(EXPECTED_UNCLASSIFIED_HOURS);
    expect(unclassified.share).toBe(EXPECTED_UNCLASSIFIED_SHARE);
  });

  it("carries the denominator on every row so a share is auditable", () => {
    for (const row of allocation(FIXTURE_SLOTS)) {
      expect(row.loggedHours).toBe(EXPECTED_LOGGED_HOURS);
    }
  });

  it("makes the shares sum to one", () => {
    const total = allocation(FIXTURE_SLOTS).reduce(
      (sum, row) => sum + (row.share ?? 0),
      0,
    );
    // Only true because the uncategorised row is kept. Drop it and this is 0.75.
    expect(total).toBeCloseTo(1, 10);
  });

  it("returns nothing for a range with nothing in it", () => {
    expect(allocation([])).toEqual([]);
  });
});

describe("allocationSummary", () => {
  it("reproduces the fixture totals exactly", () => {
    const summary = allocationSummary(FIXTURE_SLOTS);
    expect(summary.productiveHours).toBe(EXPECTED_PRODUCTIVE_HOURS);
    expect(summary.unproductiveHours).toBe(EXPECTED_UNPRODUCTIVE_HOURS);
    expect(summary.unclassifiedHours).toBe(EXPECTED_UNCLASSIFIED_HOURS);
    expect(summary.loggedHours).toBe(EXPECTED_LOGGED_HOURS);
  });

  it("leaves unclassified time in the denominator", () => {
    // 2.0 / 4.0, not 2.0 / 3.0. Excluding unclassified hours would report 0.667
    // and quietly flatter every range the user had not finished classifying.
    const summary = allocationSummary(FIXTURE_SLOTS);
    expect(summary.productiveShare).toBe(EXPECTED_PRODUCTIVE_SHARE);
    expect(summary.productiveShare).not.toBeCloseTo(2 / 3, 5);
  });

  it("reconciles with the per-category rows", () => {
    // Two grains of one metric. If they can disagree, one is wrong and nothing
    // in the UI would reveal which.
    const rows = allocation(FIXTURE_SLOTS);
    const summed = rows.reduce((sum, row) => sum + row.actualHours, 0);
    expect(summed).toBe(allocationSummary(FIXTURE_SLOTS).loggedHours);
  });

  it("has no share at all when nothing was logged", () => {
    // Not zero. A range with no hours has no allocation, and a 0% here would be
    // indistinguishable from a range that was entirely unproductive.
    const summary = allocationSummary([]);
    expect(summary.loggedHours).toBe(0);
    expect(summary.productiveShare).toBeNull();
  });

  it("counts a slot with no flag as neither productive nor unproductive", () => {
    const slots: AllocationSlot[] = [
      { categoryId: null, categoryName: null, isProductive: null },
    ];
    const summary = allocationSummary(slots);
    expect(summary.productiveHours).toBe(0);
    expect(summary.unproductiveHours).toBe(0);
    expect(summary.unclassifiedHours).toBe(0.25);
    // The share is defined — an hour was logged — and it is zero, because none
    // of it is known to be productive. That is a different claim from "null".
    expect(summary.productiveShare).toBe(0);
  });
});
