import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Phase 0 dashboard.
 *
 * Shows only what is actually measured today, which is nothing yet. The real
 * dashboard arrives in Phase 3 once the goal graph and time ledger exist. It
 * deliberately does not render placeholder charts or sample numbers — a metric
 * that looks real but is not undermines the point of the whole app.
 */
export default async function DashboardPage() {
  const supabase = await createClient();

  // Reads through RLS with the user's own session, so this returns their row
  // and nothing else even though the query has no explicit user filter.
  const { data: profile } = await supabase
    .from("profiles")
    .select("timezone, waking_start, waking_end, ewma_half_life_days")
    .single();

  const { count: categoryCount } = await supabase
    .from("categories")
    .select("*", { count: "exact", head: true })
    .is("archived_at", null);

  const wakingHours = profile
    ? hoursBetween(profile.waking_start, profile.waking_end)
    : null;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Coverage, fidelity and allocation land in Phase 3, once there is time data to measure."
      />

      <div className="px-8 py-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat
            label="Waking window"
            value={
              profile
                ? `${trimSeconds(profile.waking_start)} – ${trimSeconds(profile.waking_end)}`
                : "—"
            }
            detail={
              wakingHours !== null
                ? `${wakingHours * 4} slots of 15 minutes each day`
                : undefined
            }
          />
          <Stat
            label="Categories"
            value={categoryCount?.toString() ?? "—"}
            detail="Seeded on sign-up; edit them in Settings."
          />
          <Stat
            label="EWMA half-life"
            value={
              profile ? `${profile.ewma_half_life_days} days` : "—"
            }
            detail="Weighting applied to every trend in the app."
          />
        </section>

        <section className="mt-8 max-w-2xl rounded-md border border-border bg-bg-elevated p-5">
          <h2 className="text-sm font-semibold text-text">What comes next</h2>
          <ol className="mt-3 flex flex-col gap-2 text-sm text-text-secondary">
            <Step n={1}>
              The goal graph — six horizons from day to decade, linked as a DAG so
              every task traces up to a long-term goal.
            </Step>
            <Step n={2}>
              The time ledger — 96 slots a day, planned the night before and
              reconciled at day close.
            </Step>
            <Step n={3}>
              This dashboard, showing coverage, fidelity, allocation and goal pace
              computed from the two above.
            </Step>
          </ol>
        </section>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-bg-elevated p-4">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-1.5 font-mono text-xl text-text">{value}</p>
      {detail ? (
        <p className="mt-1 text-xs text-text-tertiary">{detail}</p>
      ) : null}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-px font-mono text-xs text-text-tertiary">
        P{n}
      </span>
      <span>{children}</span>
    </li>
  );
}

/** "07:00:00" -> "07:00" */
function trimSeconds(time: string) {
  return time.slice(0, 5);
}

function hoursBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}
