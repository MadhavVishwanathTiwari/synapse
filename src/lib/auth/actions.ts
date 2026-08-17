"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type AuthState = { error: string | null };

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

/**
 * Email + password sign-in.
 *
 * Chosen over magic links deliberately: Supabase's built-in SMTP is rate limited
 * on the free tier, and a login that depends on email delivery is a bad failure
 * mode for the one person who uses this app. There is no public sign-up route —
 * the account is created once from the Supabase dashboard.
 */
export async function signIn(
  _prevState: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Deliberately not distinguishing "no such user" from "wrong password" —
    // that difference is an account-enumeration oracle.
    return { error: "Incorrect email or password." };
  }

  // Only allow same-origin redirects; an open redirect here would be a
  // phishing vector on the sign-in flow.
  const next = parsed.data.next;
  const destination = next?.startsWith("/") && !next.startsWith("//")
    ? next
    : "/dashboard";

  revalidatePath("/", "layout");
  redirect(destination);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
