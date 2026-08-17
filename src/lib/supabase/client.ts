import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Browser-side Supabase client.
 *
 * Uses the publishable key, so every query runs under RLS with the signed-in
 * user's identity. Safe to call from Client Components.
 */
export function createClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
