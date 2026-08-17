import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/*
 * Everything under test in Phase 1 is pure: the metric mirrors and the ancestry
 * layout algorithm. No jsdom, no React plugin — those get wired in when the
 * first component test genuinely needs them, not before.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
