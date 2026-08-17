"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { DayGridRow, TimeSlotInsert } from "@/lib/supabase/types";

import { friendlySlotError } from "./errors";
import { clearSlotsSchema, closeDaySchema, paintSlotsSchema } from "./schemas";

export type SlotActionState = { error: string | null; ok: boolean };

/** Day close reports how much it actually did; "done" alone would be unverifiable. */
export type CloseDayState = SlotActionState & { filled: number };

/*
 * Painting an actual slot changes goal_own_hours, and therefore the effort
 * rollup of every ancestor of that goal. Walking the ancestry to revalidate each
 * one would be a lot of work for pages that are already dynamic — they read
 * cookies, so they re-render per request regardless. These two calls exist to
 * clear the client-side Router Cache, which is what would otherwise show a stale
 * grid after a mutation.
 */
function revalidateLedger() {
  revalidatePath("/today");
  revalidatePath("/goals");
}

export async function paintSlots(input: unknown): Promise<SlotActionState> {
  const parsed = paintSlotsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, ok: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again.", ok: false };

  const rows: TimeSlotInsert[] = parsed.data.slot_starts.map((slot_start) => ({
    user_id: user.id,
    slot_start,
    kind: parsed.data.kind,
    goal_id: parsed.data.goal_id ?? null,
    category_id: parsed.data.category_id ?? null,
    note: parsed.data.note ?? null,
  }));

  // Repainting a slot replaces its assignment; the primary key is
  // (user_id, slot_start, kind), so planned and actual never collide.
  const { error } = await supabase
    .from("time_slots")
    .upsert(rows, { onConflict: "user_id,slot_start,kind" });

  if (error) return { error: friendlySlotError(error), ok: false };

  revalidateLedger();
  return { error: null, ok: true };
}

export async function clearSlots(input: unknown): Promise<SlotActionState> {
  const parsed = clearSlotsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, ok: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("time_slots")
    .delete()
    .eq("kind", parsed.data.kind)
    .in("slot_start", parsed.data.slot_starts);

  if (error) return { error: friendlySlotError(error), ok: false };

  revalidateLedger();
  return { error: null, ok: true };
}

/**
 * The day-close ritual: copy the plan into every slot that has no actual yet.
 *
 * Only the gaps are filled. A slot that already records what happened is never
 * overwritten by what was intended — that would manufacture fidelity, which is
 * the one thing this metric must never do.
 *
 * The plan itself is left untouched for the same reason: the divergence between
 * the two is the planning-bias signal, and copying in either direction destroys
 * it.
 */
export async function fillActualFromPlan(input: unknown): Promise<CloseDayState> {
  const parsed = closeDaySchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, ok: false, filled: 0 };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Sign in again.", ok: false, filled: 0 };
  }

  const { data, error: gridError } = await supabase.rpc("get_day_grid", {
    p_date: parsed.data.date,
  });

  if (gridError) {
    return { error: friendlySlotError(gridError), ok: false, filled: 0 };
  }

  const gaps = ((data ?? []) as unknown as DayGridRow[]).filter(
    (row) => row.has_planned && !row.has_actual,
  );

  if (gaps.length === 0) {
    return { error: null, ok: true, filled: 0 };
  }

  const rows: TimeSlotInsert[] = gaps.map((row) => ({
    user_id: user.id,
    slot_start: row.slot_start,
    kind: "actual",
    goal_id: row.planned_goal_id,
    category_id: row.planned_category_id,
    note: row.planned_note,
  }));

  // ignoreDuplicates so a slot logged between the read above and this write is
  // left alone rather than overwritten by the plan.
  const { error } = await supabase
    .from("time_slots")
    .upsert(rows, { onConflict: "user_id,slot_start,kind", ignoreDuplicates: true });

  if (error) return { error: friendlySlotError(error), ok: false, filled: 0 };

  revalidateLedger();
  return { error: null, ok: true, filled: rows.length };
}
