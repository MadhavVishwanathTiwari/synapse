/**
 * Connection resolution shared by the migration wrapper and the SQL test runner.
 *
 * Supabase's direct host (db.<ref>.supabase.co) publishes AAAA records only — it
 * is unreachable from IPv4-only networks, which most Indian home ISPs are. The
 * session pooler is IPv4 and runs in *session* mode, so it supports DDL and is a
 * correct substitute.
 *
 * The transaction pooler (:6543) is deliberately excluded: transaction-mode
 * pooling cannot run DDL or prepared statements, and pointing migrations at it
 * produces partial application rather than a clean failure.
 */

import net from "node:net";

const CANDIDATES = [
  ["SUPABASE_DIRECT_URI", "direct connection"],
  ["SUPABASE_SESSION_URI", "session pooler"],
];

export function probe(host, port, timeout = 4000) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

export async function resolveDbUrl() {
  const tried = [];

  for (const [varName, label] of CANDIDATES) {
    const raw = process.env[varName];
    if (!raw) {
      tried.push(`  ${varName} — not set`);
      continue;
    }

    let url;
    try {
      url = new URL(raw);
    } catch {
      tried.push(`  ${varName} — unparseable`);
      continue;
    }

    const port = Number(url.port || 5432);
    if (await probe(url.hostname, port)) {
      if (varName !== "SUPABASE_DIRECT_URI") {
        console.log(`Direct connection unreachable; using ${label}.`);
      }
      return raw;
    }
    tried.push(`  ${varName} — ${url.hostname}:${port} unreachable`);
  }

  console.error(
    `No usable database connection.\n${tried.join("\n")}\n\n` +
      "Check .env.local against .env.example. Connection strings are in the\n" +
      "Supabase dashboard under Project Settings → Database.",
  );
  process.exit(1);
}

/** Redacts credentials so failures can be reported without leaking the password. */
export function safeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}:***@${u.hostname}:${u.port}${u.pathname}`;
  } catch {
    return "<unparseable connection string>";
  }
}
