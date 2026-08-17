/**
 * Allocation: where the logged hours went.
 *
 * SQL counterparts: `public.allocation` and `public.allocation_summary`, which
 * are authoritative — the dashboard and the Phase 5 nudge engine both read
 * those, never this. This mirror exists because the metric has two states that
 * the type system will not remind anyone about, and both deserve fixtures:
 *
 *   1. Time logged with no category at all. It has no productive flag — not a
 *      false one — and it belongs in the denominator, not outside it.
 *   2. A range with nothing logged. The share is undefined, not zero.
 *
 * IT IS NOT A SCORE. `is_productive` separates intentional investment from
 * maintenance and leisure; it marks sleep as productive on purpose. The metric
 * answers "where did the hours go", and nothing here or in the UI may decorate
 * it with a judgement the data does not carry. See docs/DECISIONS.md 019.
 */

import { SLOT_HOURS } from "./slots";

/** The subset of a logged slot this metric reads, with its category resolved. */
export type AllocationSlot = {
  categoryId: string | null;
  categoryName: string | null;
  /** Null when the slot has no category — there is no flag on unclassified time. */
  isProductive: boolean | null;
};

export type AllocationRow = {
  categoryId: string | null;
  categoryName: string | null;
  isProductive: boolean | null;
  actualHours: number;
  /** The range total, carried on every row so the denominator stays visible. */
  loggedHours: number;
  /** Null when nothing was logged in the range. */
  share: number | null;
};

export type AllocationSummary = {
  productiveHours: number;
  unproductiveHours: number;
  /** Reported separately and left in the denominator, never folded into either side. */
  unclassifiedHours: number;
  loggedHours: number;
  /** Null when nothing was logged: no hours means no allocation, not zero. */
  productiveShare: number | null;
};

/**
 * Hours per category, and each category's share of everything logged.
 *
 * The uncategorised group is kept rather than dropped. Omitting it would produce
 * shares that do not sum to the range, and unclassified time is usually the part
 * worth looking at.
 */
export function allocation(slots: readonly AllocationSlot[]): AllocationRow[] {
  const loggedHours = slots.length * SLOT_HOURS;

  const groups = new Map<string, { slot: AllocationSlot; count: number }>();
  for (const slot of slots) {
    // A single key for every uncategorised slot, distinct from any real id.
    const key = slot.categoryId ?? "";
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, { slot, count: 1 });
    }
  }

  return [...groups.values()]
    .map(({ slot, count }) => {
      const actualHours = count * SLOT_HOURS;
      return {
        categoryId: slot.categoryId,
        categoryName: slot.categoryName,
        isProductive: slot.isProductive,
        actualHours,
        loggedHours,
        share: loggedHours === 0 ? null : actualHours / loggedHours,
      };
    })
    .sort(
      (a, b) =>
        b.actualHours - a.actualHours ||
        (a.categoryName ?? "￿").localeCompare(b.categoryName ?? "￿"),
    );
}

/**
 * The same metric at the total grain.
 *
 * Unclassified hours stay in the denominator. Excluding them would inflate the
 * productive share by hiding the part of the range that was never classified,
 * which is exactly the part the user should be looking at — so it is reported as
 * its own figure instead.
 */
export function allocationSummary(
  slots: readonly AllocationSlot[],
): AllocationSummary {
  // `=== true` / `=== false` rather than truthiness: the unclassified slots carry
  // null here and must fall into their own bucket, not into either of the others.
  const productive = slots.filter((s) => s.isProductive === true).length;
  const unproductive = slots.filter((s) => s.isProductive === false).length;
  const unclassified = slots.filter((s) => s.isProductive === null).length;

  return {
    productiveHours: productive * SLOT_HOURS,
    unproductiveHours: unproductive * SLOT_HOURS,
    unclassifiedHours: unclassified * SLOT_HOURS,
    loggedHours: slots.length * SLOT_HOURS,
    productiveShare: slots.length === 0 ? null : productive / slots.length,
  };
}
