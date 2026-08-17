import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { clientEnv } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Server-side Supabase client for user-scoped work: Server Components, Route
 * Handlers and Server Actions.
 *
 * Deliberately uses the *publishable* key, not a secret one. Paired with the
 * user's session cookie this makes auth.uid() resolve inside Postgres, so RLS
 * policies do the authorisation. Swapping in a secret key here would silently
 * disable every policy in the schema — see lib/supabase/admin.ts.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. This is expected and safe:
            // the middleware refreshes the session on every request, so the
            // rotated token is persisted there instead.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user, or null.
 *
 * Always resolves identity via getUser(), which verifies the JWT with the auth
 * server. getSession() reads the cookie without validating it and must not be
 * used for authorisation decisions on the server.
 */
export async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
