/**
 * Hand-computed fixtures for the Phase 1 metric mirrors.
 *
 * Every expected value here is derivable with a pen. Where a figure comes out
 * exact it is asserted exactly; the arithmetic was chosen so that it does.
 *
 * The same fixtures are asserted against the authoritative SQL in
 * `supabase/tests/phase-1.sql`, so a drift between the two fails a gate rather
 * than going unnoticed.
 */

import type { EffortEdge } from "@/lib/metrics/rollup";

/*
 * The diamond.
 *
 *        ┌──1.0──> B ──0.5──┐
 *   D ───┤                  ├──> A
 *        └──1.0──> C ──0.5──┘
 *
 * A's outgoing contributions total exactly 1.0, so all of A's effort reaches D
 * — once. A is the only goal with logged hours, so the rollup at D is exactly
 * A's 10 hours.
 */
export const DIAMOND_EDGES: EffortEdge[] = [
  { parentId: "D", childId: "B", weight: 1.0 },
  { parentId: "D", childId: "C", weight: 1.0 },
  { parentId: "B", childId: "A", weight: 0.5 },
  { parentId: "C", childId: "A", weight: 0.5 },
];

export const DIAMOND_HOURS = new Map<string, number>([
  ["D", 0],
  ["B", 0],
  ["C", 0],
  ["A", 10],
]);

/** 1.0 × 0.5 (via B) + 1.0 × 0.5 (via C) = 1.0 */
export const DIAMOND_LEAF_SHARE = 1.0;

/** 10 hours × share 1.0. Not 5 (dedup) and not 20 (unweighted). */
export const DIAMOND_ROLLUP = 10;

/*
 * A one-day half-life gives α = 1 − 2^(−1) = 0.5, so (1 − α) = 0.5 and every
 * weight is an exact binary fraction. Over the series [4, 1], where the 4 is a
 * day old and the 1 is today:
 *
 *   weighted = 0.5·4 + 1·1 = 3
 *   weights  = 0.5   + 1   = 1.5
 *   achieved = 3 / 1.5     = 2
 *
 * Exact in IEEE 754, so it is asserted exactly rather than within a tolerance.
 * Note the result sits between the two observations and nearer the recent one,
 * which is the property the normalisation exists to guarantee.
 */
export const EWMA_HALF_LIFE = 1;
export const EWMA_SERIES = [4, 1];
export const EWMA_EXPECTED = 2;

/** The dates the fixture series corresponds to, oldest first. */
export const EWMA_START = "2026-03-01";
export const EWMA_END = "2026-03-02";
