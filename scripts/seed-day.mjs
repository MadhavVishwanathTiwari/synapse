#!/usr/bin/env node
/**
 * Seeds one planned-and-lived day against the chain from `seed-goals.mjs`, so
 * the Phase 2 acceptance criteria can be checked without hand-painting 96 slots.
 *
 * The day is 2026-08-17 — the due date of the seeded "Cold email 20 people" goal
 * — in whatever timezone the profile carries. Local times below are projected
 * through it in SQL rather than in JavaScript, so this script has no timezone
 * logic of its own to get wrong.
 *
 * WHAT IT IS FOR. Acceptance criterion 5 asks for a non-zero, hand-checkable
 * effort rollup on the seeded chain. This produces one:
 *
 *   6 actual slots against the day goal      = 1.5 h
 *   share reaching ₹10Cr net worth           = 0.7 x 0.7 x 1.0 x 1.0 x 0.6
 *                                            = 0.294
 *   rollup at the decade goal                = 1.5 x 0.294 = 0.441 h
 *
 * Run with --verify to have it print those back.
 *
 * Deliberately a script and not a migration, for the same reason as the goal
 * seed: this is the user's own data, not schema.
 *
 * Usage:
 *   npm run seed:day             insert or update the day
 *   npm run seed:day -- --reset  delete the seeded slots
 *   npm run seed:day -- --verify print the rollups and adherence back
 */

import pg from "pg";

import { resolveDbUrl, safeUrl } from "./lib/db-url.mjs";

const DATE = "2026-08-17";

/** The day goal from seed-goals.mjs. Kept in sync by hand; it is one id. */
const EMAIL_DAY = "5eed0000-0000-0000-0000-00000000000f";
const NET_WORTH = "5eed0000-0000-0000-0000-00000000000a";
const EMAIL_WEEK = "5eed0000-0000-0000-0000-00000000000e";

/*
 * [kind, first local time, last local time, category name, goal id]
 *
 * The ranges are inclusive of both ends, matching generate_series. The plan and
 * the actual diverge on purpose — a day that went exactly to plan would exercise
 * neither the fidelity denominator nor the planning-bias signal.
 */
const SLOTS = [
  // The plan, written the night before.
  ["planned", "09:00", "10:45", "Deep Work", EMAIL_DAY],
  ["planned", "11:00", "11:45", "Admin", null],
  ["planned", "18:00", "18:45", "Gym", null],

  // What actually happened.
  ["actual", "07:00", "07:45", "Meals", null],
  ["actual", "09:00", "10:15", "Deep Work", EMAIL_DAY], // 6 slots: honoured
  ["actual", "10:30", "10:45", "Distraction", null], //    2 slots: missed
  ["actual", "11:00", "11:45", "Admin", null], //           4 slots: honoured
  // 18:00 was planned for the gym and never logged. That miss is the point.
];

const args = new Set(process.argv.slice(2));
const dbUrl = await resolveDbUrl();
const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

try {
  const { rows: users } = await client.query(
    "select id, email from auth.users order by created_at limit 2",
  );

  if (users.length === 0) {
    console.error(
      "No user exists yet. Create one in the Supabase dashboard under\n" +
        "Authentication → Users → Add user, with Auto Confirm ticked.",
    );
    process.exit(1);
  }
  if (users.length > 1) {
    console.error("More than one user found; this is a single-user app.");
    process.exit(1);
  }

  const userId = users[0].id;

  const { rows: seeded } = await client.query(
    "select 1 from public.goals where id = $1",
    [EMAIL_DAY],
  );
  if (seeded.length === 0) {
    console.error(
      "The goal chain is not seeded, so the slots would have nothing to attach\n" +
        "to and the rollup would stay at zero. Run `npm run seed:goals` first.",
    );
    process.exit(1);
  }

  console.log(`Seeding ${DATE} for ${users[0].email} on ${safeUrl(dbUrl)}`);

  await client.query("begin");

  // Clear the whole local day rather than the individual ranges, so a re-run
  // after editing SLOTS above cannot leave an orphan behind.
  await client.query(
    `delete from public.time_slots t
      using public.profiles p
      where p.id = t.user_id
        and t.user_id = $1
        and t.slot_start >= ($2::date::timestamp at time zone p.timezone)
        and t.slot_start <  (($2::date + 1)::timestamp at time zone p.timezone)`,
    [userId, DATE],
  );

  if (args.has("--reset")) {
    await client.query("commit");
    console.log(`Slots for ${DATE} removed.`);
    process.exit(0);
  }

  let inserted = 0;
  for (const [kind, from, to, category, goalId] of SLOTS) {
    const { rowCount } = await client.query(
      `insert into public.time_slots (user_id, slot_start, kind, goal_id, category_id)
       select $1,
              s,
              $2::public.slot_kind,
              $3::uuid,
              (select c.id from public.categories c
                where c.user_id = $1 and c.name = $4)
         from public.profiles p,
              lateral generate_series(
                (($5::date || ' ' || $6)::timestamp at time zone p.timezone),
                (($5::date || ' ' || $7)::timestamp at time zone p.timezone),
                interval '15 minutes') s
        where p.id = $1`,
      [userId, kind, goalId, category, DATE, from, to],
    );
    inserted += rowCount;
  }

  await client.query("commit");
  console.log(`Seeded ${inserted} slots across ${SLOTS.length} ranges.`);

  if (args.has("--verify")) {
    const hours = await client.query(
      "select public.goal_own_hours($1) as h",
      [EMAIL_DAY],
    );
    console.log(`\n--- own hours on 'Cold email 20 people' ---`);
    console.log(`  ${hours.rows[0].h} h   (6 actual slots x 0.25)`);

    console.log("\n--- effort rollup up the chain ---");
    for (const [label, id] of [
      ["Cold email 100 people (week)", EMAIL_WEEK],
      ["₹10Cr net worth (decade)", NET_WORTH],
    ]) {
      const r = await client.query("select public.goal_effort_rollup($1) as v", [id]);
      console.log(`  ${r.rows[0].v}\t${label}`);
    }

    const share = await client.query(
      `select s.share from public.goal_effort_shares($1) s where s.goal_id = $2`,
      [NET_WORTH, EMAIL_DAY],
    );
    console.log(
      `\n  share of the day goal reaching the decade goal: ${share.rows[0]?.share}`,
    );
    console.log("  0.7 x 0.7 x 1.0 x 1.0 x 0.6 = 0.294 — the diamond splitting, not doubling");

    console.log(`\n--- adherence for ${DATE} ---`);
    const cov = await client.query("select * from public.day_coverage($1, $2)", [
      DATE,
      userId,
    ]);
    const fid = await client.query("select * from public.day_fidelity($1, $2)", [
      DATE,
      userId,
    ]);
    console.log(
      `  coverage  ${cov.rows[0].logged}/${cov.rows[0].expected} = ${cov.rows[0].coverage}`,
    );
    console.log(
      `  fidelity  ${fid.rows[0].honoured}/${fid.rows[0].planned} = ${fid.rows[0].fidelity}`,
    );

    console.log(`\n--- planning bias for ${DATE} ---`);
    const bias = await client.query(
      "select * from public.planning_bias($1, $1, $2)",
      [DATE, userId],
    );
    for (const r of bias.rows) {
      console.log(
        `  ${(r.category_name ?? "Uncategorised").padEnd(14)}` +
          `planned ${r.planned_hours}\tactual ${r.actual_hours}\tbias ${r.bias_hours}\tratio ${r.bias_ratio ?? "—"}`,
      );
    }
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(`\nSeed failed: ${error.message}`);
  if (error.detail) console.error(`  detail: ${error.detail}`);
  process.exit(1);
} finally {
  await client.end();
}
