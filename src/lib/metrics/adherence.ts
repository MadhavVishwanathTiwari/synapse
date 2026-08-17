/**
 * Coverage and fidelity over a day's slots.
 *
 * SQL counterparts: `public.day_coverage` and `public.day_fidelity`, which are
 * authoritative — the Phase 3 dashboard and the Phase 5 nudge engine both read
 * those, never this. This mirror exists because both metrics are ratios that are
 * undefined rather than zero under conditions the type system will not remind
 * anyone about, and those conditions deserve fixtures.
 *
 * Coverage and fidelity are reported separately and never blended. 100% coverage
 * with 20% fidelity means you tracked everything and followed none of it; any
 * weighted average of the two destroys exactly the information that makes them
 * actionable. See docs/DECISIONS.md 007.
 */

/** The subset of a `get_day_grid` row these two metrics read. */
export type AdherenceSlot = {
  inWakingWindow: boolean;
  hasPlanned: boolean;
  plannedGoalId: string | null;
  plannedCategoryId: string | null;
  hasActual: boolean;
  actualGoalId: string | null;
  actualCategoryId: string | null;
};

export type Coverage = {
  logged: number;
  expected: number;
  /** Null only when the waking window is empty. */
  coverage: number | null;
};

export type Fidelity = {
  planned: number;
  honoured: number;
  /** Null when nothing was planned. Not 1, and not 0. */
  fidelity: number | null;
};

/**
 * How much of the waking window is accounted for.
 *
 * Time outside the window is excluded from BOTH sides rather than counted as a
 * gap: sleeping through the night is not a tracking failure, and a metric that
 * said otherwise would be ignored within a week.
 *
 * A slot counts as logged whenever an actual exists for it, even with no goal
 * and no category — "something happened here and I don't want to classify it" is
 * still an account of the time.
 */
export function dayCoverage(slots: readonly AdherenceSlot[]): Coverage {
  const inWindow = slots.filter((s) => s.inWakingWindow);
  const logged = inWindow.filter((s) => s.hasActual).length;

  return {
    logged,
    expected: inWindow.length,
    coverage: inWindow.length === 0 ? null : logged / inWindow.length,
  };
}

/**
 * Whether a planned slot was honoured, judged at the granularity it was planned:
 *
 *   a goal was planned      → the same goal must have been worked
 *   a category was planned  → the time must have gone to that category
 *   neither was planned     → any logged actual counts
 *
 * Judging a category-level plan against the goal would mark a kept commitment as
 * broken; judging a goal-level plan against the category would mark a broken one
 * as kept. See docs/DECISIONS.md 017.
 */
export function isHonoured(slot: AdherenceSlot): boolean {
  if (!slot.hasPlanned) return false;
  if (slot.plannedGoalId !== null) return slot.actualGoalId === slot.plannedGoalId;
  if (slot.plannedCategoryId !== null) {
    return slot.actualCategoryId === slot.plannedCategoryId;
  }
  return slot.hasActual;
}

/**
 * How much of the plan was followed.
 *
 * A day with no plan has a fidelity of NOTHING. Returning 1 would reward never
 * planning and returning 0 would punish it; both are claims about a ratio with
 * no denominator. Null, and the UI says so.
 *
 * Unlike coverage this is not restricted to the waking window — a commitment
 * made for 06:00 is still a commitment.
 */
export function dayFidelity(slots: readonly AdherenceSlot[]): Fidelity {
  const planned = slots.filter((s) => s.hasPlanned);
  const honoured = planned.filter(isHonoured).length;

  return {
    planned: planned.length,
    honoured,
    fidelity: planned.length === 0 ? null : honoured / planned.length,
  };
}
