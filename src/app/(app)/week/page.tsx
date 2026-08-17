import { ChevronLeft, ChevronRight } from "lucide-react";
import { DateTime } from "luxon";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import type { AdherenceSeriesRow, DayGridRow } from "@/lib/supabase/types";

import { normaliseDate, todayIn } from "../today/display";
import {
  WeekGrid,
  type CategoryOption,
  type GoalOption,
  type WeekDay,
} from "./week-grid";

export const metadata: Metadata = { title: "Week" };

/**
 * The week view over the time ledger.
 *
 * Read-only on purpose. Painting belongs on Today, where a single day has room
 * for a slot big enough to click accurately; this is the reporting surface that
 * Phase 2 deferred because it had nowhere coherent to live.
 *
 * It reads `get_day_grid` seven times rather than inventing a week-shaped query.
 * The dense projection already handles the local day, the waking window and DST,
 * and a second definition of "what is in this slot" would eventually disagree
 * with the first.
 */
export default async function WeekPage({ searchParams }: PageProps<"/week">) {
  const supabase = await createClient();
  const params = await searchParams;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("timezone")
    .single();

  if (!profile) {
    return (
      <>
        <PageHeader title="Week" />
        <div className="px-8 py-6">
          <p role="alert" className="text-sm text-danger">
            Could not load your profile
            {profileError ? `: ${profileError.message}` : ""}. The grid is
            projected through your timezone, so it cannot be drawn without it.
          </p>
        </div>
      </>
    );
  }

  const today = todayIn(profile.timezone);
  const anchor = normaliseDate(params.week) ?? today;
  // Luxon weeks are ISO weeks, so this is always a Monday.
  const start = DateTime.fromISO(anchor).startOf("week");
  const dates = Array.from(
    { length: 7 },
    (_, i) => start.plus({ days: i }).toISODate()!,
  );
  const end = dates[6];

  const [gridResults, adherenceRes, categoriesRes, goalsRes] = await Promise.all([
    Promise.all(dates.map((date) => supabase.rpc("get_day_grid", { p_date: date }))),
    // The per-day figures come from the same functions the dashboard reads, in
    // one call rather than fourteen.
    supabase.rpc("adherence_series", { p_from: dates[0], p_to: end }),
    supabase
      .from("categories")
      .select("id, name, color")
      .order("sort_order"),
    supabase.from("goals").select("id, title").neq("status", "abandoned"),
  ]);

  const failure =
    gridResults.find((r) => r.error)?.error ??
    adherenceRes.error ??
    categoriesRes.error ??
    goalsRes.error;

  if (failure) {
    return (
      <>
        <PageHeader title="Week" />
        <div className="px-8 py-6">
          <p role="alert" className="text-sm text-danger">
            Could not load the week: {failure.message}
          </p>
        </div>
      </>
    );
  }

  const adherence = (adherenceRes.data ?? []) as unknown as AdherenceSeriesRow[];
  const byDay = new Map(adherence.map((row) => [row.day, row]));

  const days: WeekDay[] = dates.map((date, index) => {
    const figures = byDay.get(date);
    const at = DateTime.fromISO(date);

    return {
      date,
      weekday: at.toFormat("ccc"),
      dayOfMonth: at.toFormat("d"),
      isToday: date === today,
      isFuture: date > today,
      rows: (gridResults[index].data ?? []) as unknown as DayGridRow[],
      coverage: figures?.coverage ?? null,
      logged: figures?.logged ?? 0,
      expected: figures?.expected ?? 0,
      fidelity: figures?.fidelity ?? null,
      honoured: figures?.honoured ?? 0,
      planned: figures?.planned ?? 0,
    };
  });

  const previous = start.minus({ weeks: 1 }).toISODate()!;
  const next = start.plus({ weeks: 1 }).toISODate()!;

  return (
    <>
      <PageHeader
        title={weekLabel(start, today)}
        description={`${start.toFormat("d LLL")} – ${DateTime.fromISO(end).toFormat("d LLL yyyy")} · plan beside actual, read-only`}
        actions={
          <nav className="flex items-center gap-1" aria-label="Change week">
            <WeekLink date={previous} label="Previous week">
              <ChevronLeft className="size-4" />
            </WeekLink>
            <Link
              href="/week"
              className="rounded-sm px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
            >
              This week
            </Link>
            <WeekLink date={next} label="Next week">
              <ChevronRight className="size-4" />
            </WeekLink>
          </nav>
        }
      />

      <WeekGrid
        days={days}
        categories={(categoriesRes.data ?? []) as CategoryOption[]}
        goals={(goalsRes.data ?? []) as GoalOption[]}
      />
    </>
  );
}

function weekLabel(start: DateTime, today: string): string {
  const thisWeek = DateTime.fromISO(today).startOf("week");
  const diff = start.diff(thisWeek, "weeks").weeks;

  if (diff === 0) return "This week";
  if (diff === -1) return "Last week";
  if (diff === 1) return "Next week";
  return `Week of ${start.toFormat("d LLL yyyy")}`;
}

function WeekLink({
  date,
  label,
  children,
}: {
  date: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={`/week?week=${date}`}
      aria-label={label}
      title={label}
      className="flex size-7 items-center justify-center rounded-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
    >
      {children}
    </Link>
  );
}
