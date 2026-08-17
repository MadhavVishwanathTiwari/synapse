#!/usr/bin/env node
/**
 * Supabase CLI wrapper.
 *
 * Exists for two reasons:
 *
 *  1. Connection routing. DDL cannot run through a connection pooler, so every
 *     command here is pinned to SUPABASE_DIRECT_URI. Using the transaction
 *     pooler for migrations fails in confusing ways (prepared statement errors,
 *     partially applied DDL), so the choice is made once, here.
 *
 *  2. Cross-platform env loading. `VAR=x cmd` is not valid on PowerShell and
 *     shell-specific npm scripts break on one machine or the other. Node's
 *     built-in --env-file handles it identically everywhere.
 *
 * Secrets are passed to the child process and never printed.
 *
 * Usage (via npm scripts):
 *   npm run db:status   list local vs applied migrations
 *   npm run db:push     apply pending migrations
 *   npm run db:types    regenerate src/lib/supabase/database.types.ts
 *   npm run db:test     run supabase/tests/*.sql assertions, then roll back
 *                       (add `-- <path>` to run a single file)
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { resolveDbUrl, safeUrl } from "./lib/db-url.mjs";

const TYPES_PATH = "src/lib/supabase/database.types.ts";

// Connections are resolved lazily — type generation via the Management API needs
// no database connection at all, so probing there would fail for no reason.

function supabase(args, { capture = false } = {}) {
  return spawnSync("npx", ["--yes", "supabase", ...args], {
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    shell: process.platform === "win32",
    encoding: "utf8",
  });
}

const command = process.argv[2];

switch (command) {
  case "status": {
    const dbUrl = await resolveDbUrl();
    const r = supabase(["migration", "list", "--db-url", dbUrl]);
    process.exit(r.status ?? 1);
    break;
  }

  case "push": {
    const dbUrl = await resolveDbUrl();
    console.log(`Applying migrations to ${safeUrl(dbUrl)}`);
    const r = supabase([
      "db",
      "push",
      "--db-url",
      dbUrl,
      "--include-all",
      "--yes",
    ]);
    process.exit(r.status ?? 1);
    break;
  }

  case "types": {
    /*
     * Two generation paths, and the choice is not cosmetic:
     *
     *   --project-id  goes through the Management API. Needs SUPABASE_ACCESS_TOKEN
     *                 but NOT Docker. This is the path that works here and in CI.
     *
     *   --db-url      introspects over Postgres, but the CLI shells out to a
     *                 container to do it, so it requires a running Docker daemon.
     *
     * Prefer the API path whenever a token is present.
     */
    const token = process.env.SUPABASE_ACCESS_TOKEN;
    let args;

    if (token) {
      const ref = new URL(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      ).hostname.split(".")[0];

      if (!ref) {
        console.error(
          "Could not derive the project ref from NEXT_PUBLIC_SUPABASE_URL.",
        );
        process.exit(1);
      }

      args = ["gen", "types", "typescript", "--project-id", ref, "--schema", "public"];
    } else {
      console.log(
        "SUPABASE_ACCESS_TOKEN not set — falling back to --db-url, which needs Docker.\n" +
          "To generate without Docker, create a personal access token at\n" +
          "https://supabase.com/dashboard/account/tokens and add it to .env.local.",
      );
      const dbUrl = await resolveDbUrl();
      args = ["gen", "types", "typescript", "--db-url", dbUrl, "--schema", "public"];
    }

    const r = supabase(args, { capture: true });

    if (r.status !== 0 || !r.stdout?.trim()) {
      console.error("Type generation failed.");
      process.exit(r.status ?? 1);
    }

    const banner = [
      "// GENERATED FILE — DO NOT EDIT BY HAND.",
      "//",
      "// Regenerate after every migration:  npm run db:types",
      "//",
      "// If types here disagree with the database, the database is right.",
      "",
      "",
    ].join("\n");

    mkdirSync(dirname(TYPES_PATH), { recursive: true });
    writeFileSync(TYPES_PATH, banner + r.stdout, "utf8");
    console.log(`Wrote ${TYPES_PATH}`);
    break;
  }

  case "test": {
    /*
     * Runs a SQL assertion file against the real database inside a transaction
     * that is ALWAYS rolled back, so the assertions can create users, goals and
     * links without leaving anything behind.
     *
     * It runs over a plain pg connection rather than the Supabase CLI because
     * the assertions need to switch identity mid-file (set role authenticated +
     * request.jwt.claims) to exercise RLS as the app does, and because notices
     * are what carry the PASS lines back.
     */
    const { default: pg } = await import("pg");

    /*
     * With no argument, every file under supabase/tests runs in name order — so
     * "npm run db:test passes" keeps meaning "all of them pass" as phases
     * accumulate, rather than quietly meaning "phase 1 still passes". Pass a
     * path to run one file.
     *
     * Each file gets its own transaction. They create the same fixture users, so
     * sharing one would collide on the second file.
     */
    const files =
      process.argv.length > 3
        ? process.argv.slice(3)
        : readdirSync("supabase/tests")
            .filter((name) => name.endsWith(".sql"))
            .sort()
            .map((name) => `supabase/tests/${name}`);

    if (files.length === 0) {
      console.error("No assertion files found in supabase/tests.");
      process.exit(1);
    }

    const dbUrl = await resolveDbUrl();
    console.log(`Running ${files.length} file(s) against ${safeUrl(dbUrl)}`);

    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();

    let passes = 0;
    let failed = null;
    let failedFile = null;

    client.on("notice", (n) => {
      const message = n.message ?? "";
      if (message.startsWith("PASS")) passes += 1;
      console.log(`  ${message}`);
    });

    for (const file of files) {
      const sql = readFileSync(file, "utf8");
      console.log(`\n${file}`);

      try {
        await client.query("begin");
        await client.query(sql);
      } catch (error) {
        failed = error;
        failedFile = file;
      } finally {
        // The rollback is the point: these assertions write to real tables.
        try {
          await client.query("rollback");
        } catch {
          // The server may already have aborted the transaction for us.
        }
      }

      if (failed) break;
    }

    await client.end();

    if (failed) {
      console.error(`\n✗ ${failedFile}: ${failed.message}`);
      if (failed.detail) console.error(`  detail: ${failed.detail}`);
      if (failed.where) console.error(`  where: ${failed.where}`);
      console.error(`\n${passes} assertion(s) passed before the failure.`);
      process.exit(1);
    }

    console.log(
      `\n✓ ${passes} assertions passed across ${files.length} file(s). Rolled back.`,
    );
    break;
  }

  default:
    console.error(
      `Unknown command: ${command ?? "(none)"}\nExpected one of: status, push, types, test`,
    );
    process.exit(1);
}
