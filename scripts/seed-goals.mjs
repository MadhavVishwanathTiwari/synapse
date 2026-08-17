#!/usr/bin/env node
/**
 * Seeds the goal chain from the Phase 1 acceptance criteria:
 *
 *   cold email 20 people → get 50 replies → land 10 clients
 *                        → ₹50L revenue  → ₹10Cr net worth
 *
 * Deliberately a script and not a migration. This is the user's own data, not
 * schema, and it must be deletable without rewriting history.
 *
 * IMPORTANT — the replies → clients conversion is null ON PURPOSE. It is the
 * undeclared unit boundary that acceptance criterion 4 requires the ancestry
 * visualiser to mark rather than silently sum. Do not invent a close rate to
 * make the number go up; a plausible-looking figure there is exactly the class
 * of fabricated metric this whole project exists to eliminate.
 *
 * Usage:
 *   npm run seed:goals             insert or update the chain
 *   npm run seed:goals -- --reset  delete the seeded rows first
 *   npm run seed:goals -- --verify print the rollups back
 */

import pg from "pg";

import { resolveDbUrl, safeUrl } from "./lib/db-url.mjs";

// Fixed ids make the seed idempotent and make --reset able to find its own rows
// without touching anything the user created by hand.
const ID = {
  netWorth: "5eed0000-0000-0000-0000-00000000000a",
  revenue: "5eed0000-0000-0000-0000-00000000000b",
  clients: "5eed0000-0000-0000-0000-00000000000c",
  replies: "5eed0000-0000-0000-0000-00000000000d",
  emailWeek: "5eed0000-0000-0000-0000-00000000000e",
  emailDay: "5eed0000-0000-0000-0000-00000000000f",
  audience: "5eed0000-0000-0000-0000-000000000010",
  dropOut: "5eed0000-0000-0000-0000-000000000011",
};

const GOALS = [
  {
    id: ID.netWorth,
    horizon: "decade",
    title: "₹10Cr net worth",
    color: "purple",
    unit: "INR",
    target: 100000000,
    start: "2026-01-01",
    due: "2036-01-01",
    description:
      "The long-horizon number. Entered directly at review time, never derived — five hops of estimation would make it noise.",
  },
  {
    id: ID.revenue,
    horizon: "year",
    title: "₹50L revenue",
    color: "blue",
    unit: "INR",
    target: 5000000,
    start: "2026-01-01",
    due: "2026-12-31",
  },
  {
    id: ID.clients,
    horizon: "quarter",
    title: "Land 10 clients",
    color: "green",
    unit: "clients",
    target: 10,
    start: "2026-07-01",
    due: "2026-09-30",
  },
  {
    id: ID.replies,
    horizon: "month",
    title: "Get 50 replies",
    color: "orange",
    unit: "replies",
    target: 50,
    start: "2026-08-01",
    due: "2026-08-31",
  },
  {
    id: ID.emailWeek,
    horizon: "week",
    title: "Cold email 100 people",
    color: "yellow",
    unit: "emails",
    target: 100,
    start: "2026-08-10",
    due: "2026-08-23",
  },
  {
    id: ID.emailDay,
    horizon: "day",
    title: "Cold email 20 people",
    color: "yellow",
    unit: "emails",
    target: 20,
    start: "2026-08-17",
    due: "2026-08-17",
  },
  {
    id: ID.audience,
    horizon: "month",
    title: "Build an audience",
    color: "pink",
    unit: "followers",
    target: 5000,
    start: "2026-08-01",
    due: "2026-08-31",
  },
  {
    id: ID.dropOut,
    horizon: "year",
    title: "Drop out of college",
    color: "red",
    start: "2026-01-01",
    due: "2026-12-31",
    description:
      "No metric of its own — it is gated on revenue, not measured. See docs/DECISIONS.md 001.",
  },
];

const LINKS = [
  // parent, child, type, weight, conversion factor, note
  [ID.netWorth, ID.revenue, "contributes_to", 0.6, 0.5, "post-tax savings rate"],
  [ID.revenue, ID.clients, "contributes_to", 1.0, 500000, "₹5L average contract"],
  // The undeclared boundary. See the header.
  [ID.clients, ID.replies, "contributes_to", 1.0, null, null],
  [ID.replies, ID.emailWeek, "contributes_to", 0.7, 0.05, "observed 5% reply rate"],
  [ID.emailWeek, ID.emailDay, "contributes_to", 0.7, 1.0, "same unit"],
  // The second parent that makes this a real diamond: the day goal's outgoing
  // weights are 0.7 + 0.3, exactly 1.0, so its effort is split rather than
  // counted twice.
  [ID.audience, ID.emailDay, "contributes_to", 0.3, null, null],
  // ADR 001's own example of a lateral dependency.
  [ID.revenue, ID.dropOut, "depends_on", 1.0, null, null],
];

/** Daily increments, not running totals. */
const PROGRESS = [
  [ID.replies, "2026-08-04", 2], [ID.replies, "2026-08-05", 3],
  [ID.replies, "2026-08-06", 1], [ID.replies, "2026-08-07", 4],
  [ID.replies, "2026-08-10", 2], [ID.replies, "2026-08-11", 3],
  [ID.replies, "2026-08-12", 2], [ID.replies, "2026-08-13", 5],
  [ID.replies, "2026-08-14", 1], [ID.replies, "2026-08-17", 3],

  [ID.emailWeek, "2026-08-10", 18], [ID.emailWeek, "2026-08-11", 22],
  [ID.emailWeek, "2026-08-12", 15], [ID.emailWeek, "2026-08-13", 20],
  [ID.emailWeek, "2026-08-14", 12], [ID.emailWeek, "2026-08-17", 16],

  [ID.emailDay, "2026-08-17", 16],

  [ID.audience, "2026-08-05", 40], [ID.audience, "2026-08-09", 65],
  [ID.audience, "2026-08-13", 30], [ID.audience, "2026-08-17", 55],

  [ID.clients, "2026-07-22", 1], [ID.clients, "2026-08-11", 1],
  [ID.revenue, "2026-07-22", 450000], [ID.revenue, "2026-08-11", 600000],
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
  console.log(`Seeding ${users[0].email} on ${safeUrl(dbUrl)}`);

  await client.query("begin");

  // Deleting the goals cascades to links, progress and revisions.
  await client.query("delete from public.goals where id = any($1::uuid[])", [
    Object.values(ID),
  ]);

  if (args.has("--reset")) {
    await client.query("commit");
    console.log("Seeded rows removed.");
    process.exit(0);
  }

  for (const g of GOALS) {
    await client.query(
      `insert into public.goals
         (id, user_id, horizon, title, description, color, metric_unit,
          target_value, start_date, due_date)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        g.id, userId, g.horizon, g.title, g.description ?? null,
        g.color ?? "gray", g.unit ?? null, g.target ?? null, g.start, g.due,
      ],
    );
  }

  for (const [parent, child, type, weight, factor, note] of LINKS) {
    await client.query(
      `insert into public.goal_links
         (parent_id, child_id, user_id, link_type, contribution_weight,
          conversion_factor, conversion_note)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [parent, child, userId, type, weight, factor, note],
    );
  }

  for (const [goalId, date, value] of PROGRESS) {
    await client.query(
      `insert into public.goal_progress (goal_id, user_id, date, value)
       values ($1,$2,$3,$4)`,
      [goalId, userId, date, value],
    );
  }

  // One real revision, so the history panel is not empty on first load and the
  // revision-aware pace path has something to exercise.
  await client.query(
    `select public.update_goal_targets($1, 'clients', 10, '2026-09-30', 'active', $2)`,
    [ID.clients, "Pipeline slipped a month; kept the number, moved nothing else."],
  );

  await client.query("commit");
  console.log(`Seeded ${GOALS.length} goals, ${LINKS.length} links, ${PROGRESS.length} progress rows.`);

  if (args.has("--verify")) {
    console.log("\n--- effort shares reaching ₹10Cr net worth ---");
    const shares = await client.query(
      `select g.title, s.share
         from public.goal_effort_shares($1) s
         join public.goals g on g.id = s.goal_id
        order by s.share desc, g.title`,
      [ID.netWorth],
    );
    for (const r of shares.rows) console.log(`  ${r.share}  ${r.title}`);

    console.log("\n--- the day goal's outgoing weight budget ---");
    const budget = await client.query(
      "select allocated, remaining from public.goal_weight_budget where goal_id = $1",
      [ID.emailDay],
    );
    console.log(`  allocated ${budget.rows[0].allocated}, remaining ${budget.rows[0].remaining}`);

    console.log("\n--- outcome rollup for 'Land 10 clients' ---");
    const outcome = await client.query(
      "select value, is_complete, unsummed from public.goal_outcome_rollup($1)",
      [ID.clients],
    );
    console.log(`  value ${outcome.rows[0].value}, complete ${outcome.rows[0].is_complete}`);
    console.log(`  unsummed ${JSON.stringify(outcome.rows[0].unsummed)}`);

    console.log("\n--- pace for 'Get 50 replies' as of 2026-08-17 ---");
    const pace = await client.query(
      "select * from public.goal_pace($1, '2026-08-17')",
      [ID.replies],
    );
    console.log(" ", pace.rows[0]);

    console.log("\n--- blocked goals ---");
    const blocked = await client.query("select title, blocker_title from public.blocked_goals()");
    for (const r of blocked.rows) console.log(`  ${r.title} ← ${r.blocker_title}`);
  }
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(`\nSeed failed: ${error.message}`);
  if (error.detail) console.error(`  detail: ${error.detail}`);
  process.exit(1);
} finally {
  await client.end();
}
