import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    /*
     * The RLS boundary, enforced mechanically.
     *
     * `sb_secret_*` and `service_role` keys bypass Row Level Security entirely.
     * Anything under src/app or src/components runs in a request context that
     * has a real user session, so it must go through lib/supabase/server.ts and
     * let Postgres do the authorisation.
     *
     * Privileged access belongs in supabase/functions (Deno Edge Functions),
     * which is outside this glob.
     */
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              message:
                "The admin client bypasses RLS. Use @/lib/supabase/server so policies apply. " +
                "If you genuinely need privileged access, it belongs in an Edge Function.",
            },
            {
              name: "@supabase/supabase-js",
              importNames: ["createClient"],
              message:
                "Construct clients via @/lib/supabase/{client,server} so the correct key is used.",
            },
            /*
             * Metrics are SQL, never TypeScript. These two modules mirror
             * goal_effort_rollup and goal_pace so the weighting and the rate
             * maths can be tested against hand-computed fixtures — they are not
             * a second implementation for the app to read. If the UI computed
             * one of these itself it would eventually disagree with the nudge
             * engine, and nothing would say which was right.
             */
            {
              name: "@/lib/metrics/rollup",
              message:
                "Read effort from the goal_effort_rollup / goal_effort_shares RPCs. " +
                "This module exists to be unit-tested, not to compute what the bot reads.",
            },
            {
              name: "@/lib/metrics/pace",
              message:
                "Read pace from the goal_pace RPC so the dashboard and the nudge engine " +
                "cannot disagree. This module exists to be unit-tested.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^SUPABASE_(SECRET_KEY|SERVICE_ROLE_KEY)$/]",
          message:
            "RLS-bypassing keys must not be referenced in app or component code.",
        },
      ],
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/lib/supabase/database.types.ts",
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
