/**
 * Zod schemas for every time-ledger mutation.
 *
 * A plain module, not a `"use server"` file, so the grid can import them for
 * pre-submit validation without pulling the Server Actions into the browser
 * bundle.
 *
 * These mirror the database constraints; the constraints remain the authority.
 * Alignment in particular is checked here only to fail fast with a readable
 * message — `slot_aligned` on `time_slots` is what actually guarantees it.
 */

import { z } from "zod";

export const slotKindSchema = z.enum(["planned", "actual"]);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

/*
 * The grid sends back the instants it was given by get_day_grid rather than
 * re-deriving them from an index, so the client never has to reimplement the
 * timezone projection — and cannot disagree with the server about which instant
 * a row means.
 */
const instantSchema = z
  .iso
  .datetime({ offset: true })
  .refine((v) => Math.trunc(Date.parse(v) / 1000) % 900 === 0, {
    message: "Slots must start on a quarter hour.",
  });

/*
 * A day is 96 slots, or 100 across a fall-back DST transition. The cap is a
 * sanity bound on a single request, not a business rule.
 */
const instantsSchema = z.array(instantSchema).min(1).max(128);

/*
 * z.guid(), not z.uuid().
 *
 * Zod 4's uuid() enforces the RFC 9562 version and variant nibbles, so it
 * rejects any id that is a well-formed 128-bit value but not a generated v4 —
 * including every hand-authored id in scripts/seed-goals.mjs (5eed0000-…, whose
 * version nibble is 0). Postgres's uuid type accepts those happily, so uuid()
 * here would have the app refusing ids the database considers perfectly valid.
 * guid() checks the shape and nothing else, which is the actual contract.
 */
const optionalUuid = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.guid().optional(),
);

const optionalNote = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : (v ?? undefined)),
  z.string().trim().max(2000).optional(),
);

export const paintSlotsSchema = z.object({
  /** Carried for revalidation only; the instants are authoritative. */
  date: dateSchema,
  kind: slotKindSchema,
  slot_starts: instantsSchema,
  goal_id: optionalUuid,
  category_id: optionalUuid,
  note: optionalNote,
});

export const clearSlotsSchema = z.object({
  date: dateSchema,
  kind: slotKindSchema,
  slot_starts: instantsSchema,
});

export const closeDaySchema = z.object({ date: dateSchema });

export type PaintSlotsInput = z.input<typeof paintSlotsSchema>;
export type ClearSlotsInput = z.input<typeof clearSlotsSchema>;
