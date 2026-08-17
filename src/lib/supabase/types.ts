/*
 * Hand-written companions to the generated database types.
 *
 * `database.types.ts` is overwritten wholesale by `npm run db:types`, so nothing
 * hand-authored can live there. Everything in this file is derived from the
 * generated `Database` type rather than re-declared, which means a schema change
 * that these aliases no longer match becomes a type error rather than a silent
 * disagreement.
 *
 * The helper generics are defined here rather than re-exported from the
 * generated file on purpose: the Supabase CLI has changed whether and how it
 * emits them between versions, and this file should not break when it does.
 */

import type { Database } from "./database.types";

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];

export type Views<T extends keyof PublicSchema["Views"]> =
  PublicSchema["Views"][T]["Row"];

/**
 * The row type of a set-returning function. The generated `Returns` for these is
 * an array, and callers almost always want the element.
 */
type FnRow<T extends keyof PublicSchema["Functions"]> =
  PublicSchema["Functions"][T]["Returns"] extends readonly (infer R)[] ? R : never;

/** Convenience aliases used across the app. */
export type Profile = Tables<"profiles">;
export type Category = Tables<"categories">;
export type NotionColor = Enums<"notion_color">;

/* ------------------------------------------------------------------ phase 1 */

export type Goal = Tables<"goals">;
export type GoalLink = Tables<"goal_links">;
export type GoalProgress = Tables<"goal_progress">;
export type GoalRevision = Tables<"goal_revisions">;

export type GoalHorizon = Enums<"goal_horizon">;
export type GoalStatus = Enums<"goal_status">;
export type GoalLinkType = Enums<"goal_link_type">;

/*
 * Postgres does not record NOT NULL on view columns, so the generator marks
 * every column of goal_overview and goal_weight_budget nullable even where the
 * underlying table or a coalesce guarantees a value. Restating the real shape
 * here beats sprinkling non-null assertions across the UI.
 *
 * goal_overview is `select g.*` plus four computed columns, three of them
 * coalesced and one an `exists`, so all four are genuinely non-null.
 */
export type GoalOverview = Goal & {
  progress_total: number;
  parent_count: number;
  child_count: number;
  is_blocked: boolean;
};

export type GoalWeightBudget = {
  goal_id: string;
  user_id: string;
  allocated: number;
  remaining: number;
};

/** The raw generated shapes, for the cast at each query boundary. */
export type GoalOverviewRaw = Views<"goal_overview">;
export type GoalWeightBudgetRaw = Views<"goal_weight_budget">;

/**
 * Argument types for an RPC.
 *
 * Postgres function signatures carry no nullability information either, so the
 * generator marks every argument non-null even where the function accepts NULL.
 * Callers passing a legitimate null cast through this.
 */
export type FnArgs<T extends keyof PublicSchema["Functions"]> =
  PublicSchema["Functions"][T]["Args"];

export type PaceRow = FnRow<"goal_pace">;
export type OutcomeRow = FnRow<"goal_outcome_rollup">;
export type AncestryEdge = FnRow<"goal_ancestry">;
export type EffortShare = FnRow<"goal_effort_shares">;
export type BlockedGoal = FnRow<"blocked_goals">;
export type CriticalPathStep = FnRow<"critical_path">;

/** Every horizon, shortest first. The canonical order for columns and layers. */
export const GOAL_HORIZONS = [
  "day",
  "week",
  "month",
  "quarter",
  "year",
  "decade",
] as const satisfies readonly GoalHorizon[];

/**
 * Why a subtree was left out of an outcome rollup. `goal_outcome_rollup` returns
 * this as `Json`, so the shape is asserted here rather than inferred.
 *
 *   unit_mismatch     units differ and no conversion factor is declared
 *   child_unmeasured  the child has no metric_unit at all
 *   depth_limit       the traversal stopped before reaching this subtree
 */
export type UnsummedReason =
  | "unit_mismatch"
  | "child_unmeasured"
  | "depth_limit";

export type UnsummedSubtree = {
  goal_id: string;
  title: string;
  reason: UnsummedReason;
};

/* ------------------------------------------------------------------ phase 2 */

export type TimeSlot = Tables<"time_slots">;
export type TimeSlotInsert = TablesInsert<"time_slots">;
export type SlotKind = Enums<"slot_kind">;

/*
 * Postgres records no nullability on a function's OUT parameters either, so the
 * generator marks every column of these four non-null — including the ones that
 * are null precisely when the metric is undefined, which is the whole point of
 * them. Restating the real shape here is the same remedy as for the views above,
 * and it matters more: `coverage: number` would let the UI render "0%" for a day
 * that has no denominator at all.
 */

/** One slot of a dense day. 96 rows, except across a DST transition. */
export type DayGridRow = {
  slot_index: number;
  /** UTC instant, 900-second aligned. */
  slot_start: string;
  /** `HH:MM:SS` in the user's timezone, for the row label. */
  local_time: string;
  in_waking_window: boolean;
  has_planned: boolean;
  planned_goal_id: string | null;
  planned_category_id: string | null;
  planned_note: string | null;
  has_actual: boolean;
  actual_goal_id: string | null;
  actual_category_id: string | null;
  actual_note: string | null;
};

/** `coverage` is null only when the waking window is empty. */
export type DayCoverage = {
  logged: number;
  expected: number;
  coverage: number | null;
};

/** `fidelity` is null when nothing was planned — not 1, and not 0. */
export type DayFidelity = {
  planned: number;
  honoured: number;
  fidelity: number | null;
};

/** `bias_ratio` is null where nothing was budgeted; `category_name` where the time was unclassified. */
export type PlanningBiasRow = {
  category_id: string | null;
  category_name: string | null;
  planned_hours: number;
  actual_hours: number;
  bias_hours: number;
  bias_ratio: number | null;
};

/** The raw generated shapes, for the cast at each query boundary. */
export type DayGridRowRaw = FnRow<"get_day_grid">;
export type DayCoverageRaw = FnRow<"day_coverage">;
export type DayFidelityRaw = FnRow<"day_fidelity">;
export type PlanningBiasRowRaw = FnRow<"planning_bias">;

/** Every slot is a quarter of an hour. The one place this number is written. */
export const SLOT_MINUTES = 15;

/** The status values `goal_pace` can return, in the order it checks them. */
export type PaceStatus =
  | "unmeasured"
  | "complete"
  | "no_data"
  | "overdue"
  | "stalled"
  | "behind"
  | "on_track"
  | "ahead";
