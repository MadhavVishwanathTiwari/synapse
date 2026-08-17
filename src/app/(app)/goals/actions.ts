"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { FnArgs } from "@/lib/supabase/types";

import { friendlyDbError } from "./errors";
import {
  createGoalSchema,
  deleteLinkSchema,
  goalIdSchema,
  linkSchema,
  progressSchema,
  targetsSchema,
  updateGoalDetailsSchema,
} from "./schemas";

export type ActionState = { error: string | null; ok: boolean };
export type CreateGoalState = ActionState & { goalId: string | null };

export const INITIAL: ActionState = { error: null, ok: false };
export const INITIAL_CREATE: CreateGoalState = {
  error: null,
  ok: false,
  goalId: null,
};

/** Every goals mutation touches the board and, usually, one detail page. */
function revalidateGoal(goalId?: string) {
  revalidatePath("/goals");
  if (goalId) {
    revalidatePath(`/goals/${goalId}`);
    revalidatePath(`/goals/${goalId}/ancestry`);
  }
}

export async function createGoal(
  _prev: CreateGoalState,
  formData: FormData,
): Promise<CreateGoalState> {
  const parsed = createGoalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, ok: false, goalId: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Sign in again.", ok: false, goalId: null };
  }

  const { data, error } = await supabase
    .from("goals")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id")
    .single();

  if (error) {
    return { error: friendlyDbError(error), ok: false, goalId: null };
  }

  revalidateGoal(data.id);
  return { error: null, ok: true, goalId: data.id };
}

export async function updateGoalDetails(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateGoalDetailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, ok: false };
  }

  const { goal_id, ...fields } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.from("goals").update(fields).eq("id", goal_id);
  if (error) return { error: friendlyDbError(error), ok: false };

  revalidateGoal(goal_id);
  return { error: null, ok: true };
}

/**
 * The only write path for target_value, due_date and status.
 *
 * Goes through the RPC rather than a plain update so the optional reason reaches
 * the revision trigger. A direct update would still be logged, just without the
 * explanation — and the explanation is the whole point of asking for one.
 */
export async function updateGoalTargets(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = targetsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, ok: false };
  }

  const supabase = await createClient();

  // Unit, target and reason are all genuinely nullable in the function; the
  // generated Args type cannot express that. See FnArgs in lib/supabase/types.
  const args = {
    p_goal_id: parsed.data.goal_id,
    p_metric_unit: parsed.data.metric_unit ?? null,
    p_target_value: parsed.data.target_value ?? null,
    p_due_date: parsed.data.due_date,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason ?? null,
  } as unknown as FnArgs<"update_goal_targets">;

  const { error } = await supabase.rpc("update_goal_targets", args);

  if (error) return { error: friendlyDbError(error), ok: false };

  revalidateGoal(parsed.data.goal_id);
  return { error: null, ok: true };
}

export async function deleteGoal(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = goalIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, ok: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", parsed.data.goal_id);

  if (error) return { error: friendlyDbError(error), ok: false };

  revalidatePath("/goals");
  redirect("/goals");
}

export async function createLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = linkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again.", ok: false };

  const { error } = await supabase.from("goal_links").insert({
    ...parsed.data,
    conversion_factor: parsed.data.conversion_factor ?? null,
    conversion_note: parsed.data.conversion_note ?? null,
    user_id: user.id,
  });

  if (error) return { error: friendlyDbError(error), ok: false };

  revalidateGoal(parsed.data.child_id);
  revalidateGoal(parsed.data.parent_id);
  return { error: null, ok: true };
}

export async function updateLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = linkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, ok: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("goal_links")
    .update({
      contribution_weight: parsed.data.contribution_weight,
      conversion_factor: parsed.data.conversion_factor ?? null,
      conversion_note: parsed.data.conversion_note ?? null,
    })
    .eq("parent_id", parsed.data.parent_id)
    .eq("child_id", parsed.data.child_id)
    .eq("link_type", parsed.data.link_type);

  if (error) return { error: friendlyDbError(error), ok: false };

  revalidateGoal(parsed.data.child_id);
  revalidateGoal(parsed.data.parent_id);
  return { error: null, ok: true };
}

export async function deleteLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = deleteLinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, ok: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("goal_links")
    .delete()
    .eq("parent_id", parsed.data.parent_id)
    .eq("child_id", parsed.data.child_id)
    .eq("link_type", parsed.data.link_type);

  if (error) return { error: friendlyDbError(error), ok: false };

  revalidateGoal(parsed.data.child_id);
  revalidateGoal(parsed.data.parent_id);
  return { error: null, ok: true };
}

export async function upsertProgress(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = progressSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message, ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again.", ok: false };

  const { error } = await supabase.from("goal_progress").upsert(
    {
      goal_id: parsed.data.goal_id,
      date: parsed.data.date,
      value: parsed.data.value,
      note: parsed.data.note ?? null,
      user_id: user.id,
    },
    { onConflict: "goal_id,date" },
  );

  if (error) return { error: friendlyDbError(error), ok: false };

  revalidateGoal(parsed.data.goal_id);
  return { error: null, ok: true };
}

export async function deleteProgress(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const goalId = String(formData.get("goal_id") ?? "");
  const date = String(formData.get("date") ?? "");
  if (!goalId || !date) return { error: "Missing progress entry.", ok: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("goal_progress")
    .delete()
    .eq("goal_id", goalId)
    .eq("date", date);

  if (error) return { error: friendlyDbError(error), ok: false };

  revalidateGoal(goalId);
  return { error: null, ok: true };
}
