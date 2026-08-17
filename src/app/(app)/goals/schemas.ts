/**
 * Zod schemas for every goals mutation.
 *
 * A plain module, not a `"use server"` file, so client components can import the
 * schemas for pre-submit validation without pulling the Server Actions into the
 * browser bundle.
 *
 * These mirror the database constraints. The mirror turns a Postgres error into
 * a readable sentence, but the constraint remains the authority — see
 * docs/CONVENTIONS.md.
 */

import { z } from "zod";

export const horizonSchema = z.enum([
  "day",
  "week",
  "month",
  "quarter",
  "year",
  "decade",
]);

export const statusSchema = z.enum(["active", "done", "abandoned", "blocked"]);

export const linkTypeSchema = z.enum([
  "contributes_to",
  "depends_on",
  "relates_to",
]);

export const colorSchema = z.enum([
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
]);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

/*
 * Ids below use z.guid(), not z.uuid().
 *
 * Zod 4's uuid() enforces the RFC 9562 version and variant nibbles, so it
 * rejects any id that is a well-formed 128-bit value but not a generated v4 —
 * including every hand-authored id in scripts/seed-goals.mjs (5eed0000-…, whose
 * version nibble is 0). That made every link, progress and target edit against
 * a seeded goal fail with "Invalid UUID". Postgres's uuid type accepts those
 * ids, so validating harder than the column does is the app inventing a
 * constraint the schema never had.
 */

/*
 * An empty form field arrives as "". z.coerce.number() turns "" into 0, which
 * would quietly write a target of zero every time the field was left blank —
 * and a zero target is a real, wrong claim rather than a missing one. Collapse
 * blanks to undefined before any coercion happens.
 */
const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce.number().finite().optional(),
);

const optionalText = z.preprocess(
  (v) =>
    typeof v === "string" && v.trim() === "" ? undefined : (v ?? undefined),
  z.string().trim().max(2000).optional(),
);

export const createGoalSchema = z
  .object({
    title: z.string().trim().min(1, "A goal needs a title.").max(200),
    horizon: horizonSchema,
    description: optionalText,
    color: colorSchema.default("gray"),
    metric_unit: optionalText.pipe(
      z.string().max(40, "Keep the unit short.").optional(),
    ),
    target_value: optionalNumber,
    start_date: dateSchema,
    due_date: dateSchema,
  })
  .refine((v) => v.start_date <= v.due_date, {
    message: "A goal cannot be due before it starts.",
    path: ["due_date"],
  })
  // Mirrors goal_metric_paired.
  .refine((v) => (v.metric_unit == null) === (v.target_value == null), {
    message: "A target needs a unit, and a unit needs a target.",
    path: ["metric_unit"],
  });

export const updateGoalDetailsSchema = z.object({
  goal_id: z.guid(),
  title: z.string().trim().min(1, "A goal needs a title.").max(200),
  description: optionalText,
  color: colorSchema,
  start_date: dateSchema,
});

/** The three revisioned fields. Everything here writes goal_revisions. */
export const targetsSchema = z
  .object({
    goal_id: z.guid(),
    metric_unit: optionalText.pipe(z.string().max(40).optional()),
    target_value: optionalNumber,
    due_date: dateSchema,
    status: statusSchema,
    reason: optionalText,
  })
  .refine((v) => (v.metric_unit == null) === (v.target_value == null), {
    message: "A target needs a unit, and a unit needs a target.",
    path: ["metric_unit"],
  });

export const linkSchema = z
  .object({
    parent_id: z.guid("Pick a goal."),
    child_id: z.guid("Pick a goal."),
    link_type: linkTypeSchema,
    contribution_weight: z.coerce
      .number()
      .gt(0, "Weight must be greater than 0.")
      .lte(1, "Weight cannot exceed 1.0."),
    conversion_factor: optionalNumber.pipe(
      z.number().positive("A conversion factor must be positive.").optional(),
    ),
    conversion_note: optionalText,
  })
  .refine((v) => v.parent_id !== v.child_id, {
    message: "A goal cannot link to itself.",
    path: ["parent_id"],
  })
  // Mirrors conversion_only_on_contribution.
  .refine(
    (v) => v.link_type === "contributes_to" || v.conversion_factor == null,
    {
      message: "Conversions only apply to contributes_to links.",
      path: ["conversion_factor"],
    },
  );

export const deleteLinkSchema = z.object({
  parent_id: z.guid(),
  child_id: z.guid(),
  link_type: linkTypeSchema,
});

export const progressSchema = z.object({
  goal_id: z.guid(),
  date: dateSchema,
  // Negatives are legal: net worth can fall.
  value: z.coerce.number().finite(),
  note: optionalText,
});

export const goalIdSchema = z.object({ goal_id: z.guid() });
