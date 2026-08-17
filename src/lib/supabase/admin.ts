import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { clientEnv, serverEnv } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Privileged Supabase client. THIS BYPASSES ROW LEVEL SECURITY.
 *
 * `sb_secret_*` keys are the direct replacement for the legacy `service_role`
 * key — they are not an intermediate privilege tier. Any query issued through
 * this client can read and write every row belonging to every user, and no
 * policy in the schema will stop it.
 *
 * Legitimate uses are narrow:
 *   - scheduled Edge Functions with no user session (gcal-sync, nudge-engine)
 *   - inbound webhooks authenticated by a shared secret (telegram-webhook)
 *   - migrations and maintenance scripts
 *
 * For anything acting on behalf of a signed-in user, use lib/supabase/server.ts
 * so RLS applies. If you find yourself reaching for this client to "fix" an
 * empty result, the actual bug is a missing or wrong policy.
 *
 * The `server-only` import above makes any client-side import a build error,
 * and an ESLint rule blocks importing this module from src/app or src/components.
 */
export function createAdminClient() {
  const { SUPABASE_SECRET_KEY } = serverEnv();

  return createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    {
      auth: {
        // No user session to persist or refresh, and auto-refresh would leak a
        // timer in short-lived serverless invocations.
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
