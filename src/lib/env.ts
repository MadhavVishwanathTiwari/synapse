import { z } from "zod";

/**
 * Environment access, validated once at the boundary.
 *
 * Two rules this file exists to enforce:
 *
 * 1. `process.env.NEXT_PUBLIC_*` must be written out literally, never accessed
 *    dynamically. Next inlines these at build time by static analysis; an
 *    indexed lookup like `process.env[key]` yields `undefined` in the browser
 *    with no error, which is a genuinely hard bug to trace.
 *
 * 2. Server-only secrets must never be reachable from client code. `serverEnv()`
 *    throws if called in the browser, so a bad import fails loudly in dev rather
 *    than silently shipping a key into the bundle.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

const parsedClient = clientSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

if (!parsedClient.success) {
  throw new Error(
    `Invalid public environment variables:\n${parsedClient.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n")}\n\nCopy .env.example to .env.local and fill it in.`,
  );
}

export const clientEnv = parsedClient.data;

/**
 * Server-only variables. Optional entries belong to phases not yet built, so
 * the app boots before Google Calendar or Telegram are configured; the features
 * that need them assert their presence at their own call sites.
 */
const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
  APP_URL: z.url().default("http://localhost:3000"),

  // Phase 4 — Google Calendar
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_OAUTH_REDIRECT_URI: z.url().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),

  // Phase 5 — Telegram
  CRON_SECRET: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
});

type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error(
      "serverEnv() was called in the browser. Server secrets must never reach client code — " +
        "move this call into a Server Component, Route Handler, or Server Action.",
    );
  }

  if (cached) return cached;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${parsed.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
  }

  cached = parsed.data;
  return cached;
}

/**
 * Asserts an optional variable is present, naming the phase that needs it.
 * Produces an actionable error instead of a downstream `undefined`.
 */
export function requireEnv<K extends keyof ServerEnv>(
  key: K,
  feature: string,
): NonNullable<ServerEnv[K]> {
  const value = serverEnv()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(
      `${String(key)} is not set, but ${feature} requires it. See .env.example.`,
    );
  }
  return value as NonNullable<ServerEnv[K]>;
}
