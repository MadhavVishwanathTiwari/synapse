"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type SettingsState = { error: string | null; saved: boolean };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const settingsSchema = z
  .object({
    timezone: z
      .string()
      .refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz), {
        message: "Unknown timezone.",
      }),
    waking_start: z.string().regex(TIME, "Use HH:MM."),
    waking_end: z.string().regex(TIME, "Use HH:MM."),
    quiet_hours_start: z.string().regex(TIME, "Use HH:MM."),
    quiet_hours_end: z.string().regex(TIME, "Use HH:MM."),
    ewma_half_life_days: z.coerce
      .number()
      .int()
      .min(1, "Half-life must be at least 1 day.")
      .max(90, "Half-life cannot exceed 90 days."),
  })
  // Mirrors the waking_window_valid constraint in the database. Validating here
  // too turns a Postgres error into a readable message, but the database check
  // remains the authority.
  .refine((v) => v.waking_start < v.waking_end, {
    message: "Waking window must start before it ends.",
    path: ["waking_end"],
  });

export async function updateSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, saved: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Your session expired. Sign in again.", saved: false };

  const { error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id);

  if (error) return { error: error.message, saved: false };

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { error: null, saved: true };
}
