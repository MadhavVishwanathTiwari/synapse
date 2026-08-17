import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import type {
  DayCoverage,
  DayFidelity,
  DayGridRow,
} from "@/lib/supabase/types";

import { DayGrid, type CategoryOption, type GoalOption } from "./day-grid";
import { dayLabel, fullDate, normaliseDate, shiftDate, todayIn } from "./display";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: PageProps<"/today">) {
  const supabase = await createClient();
  const params = await searchParams;

  // The timezone decides which day "today" is, and it is the user's, not the
  // server's. Everything below is projected through it.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("timezone, waking_start, waking_end")
    .single();

  if (!profile) {
    return (
      <>
        <PageHeader title="Today" />
        <div className="px-8 py-6">
          <p role="alert" className="text-sm text-danger">
            Could not load your profile
            {profileError ? `: ${profileError.message}` : ""}. The grid is
            projected through your timezone and waking window, so it cannot be
            drawn without it.
          </p>
        </div>
      </>
    );
  }

  const date = normaliseDate(params.date) ?? todayIn(profile.timezone);

  const [gridRes, categoriesRes, goalsRes, coverageRes, fidelityRes] =
    await Promise.all([
      supabase.rpc("get_day_grid", { p_date: date }),
      supabase
        .from("categories")
        .select("id, name, color")
        .is("archived_at", null)
        .order("sort_order"),
      supabase
        .from("goals")
        .select("id, title, horizon")
        .neq("status", "abandoned")
        .order("horizon")
        .order("title"),
      supabase.rpc("day_coverage", { p_date: date }),
      supabase.rpc("day_fidelity", { p_date: date }),
    ]);

  // Surfacing this matters: an empty grid and a failed query look identical, and
  // a silent zero is exactly the confusion this project exists to remove.
  if (gridRes.error) {
    return (
      <>
        <PageHeader title="Today" />
        <div className="px-8 py-6">
          <p role="alert" className="text-sm text-danger">
            Could not load the day: {gridRes.error.message}
          </p>
        </div>
      </>
    );
  }

  const rows = (gridRes.data ?? []) as unknown as DayGridRow[];
  const categories = (categoriesRes.data ?? []) as CategoryOption[];
  const goals = (goalsRes.data ?? []) as GoalOption[];

  // Nullable in reality, non-null in the generated types — Postgres records no
  // nullability on a function's OUT parameters. See lib/supabase/types.
  const coverage = (coverageRes.data?.[0] ?? null) as DayCoverage | null;
  const fidelity = (fidelityRes.data?.[0] ?? null) as DayFidelity | null;

  const label = dayLabel(date, profile.timezone);

  return (
    <>
      <PageHeader
        title={label}
        description={`${fullDate(date)} · ${rows.length} slots of 15 minutes, ${profile.waking_start.slice(0, 5)}–${profile.waking_end.slice(0, 5)} awake`}
        actions={
          <nav className="flex items-center gap-1" aria-label="Change day">
            <DayLink date={shiftDate(date, -1)} label="Previous day">
              <ChevronLeft className="size-4" />
            </DayLink>
            <Link
              href="/today"
              className="rounded-sm px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
            >
              Today
            </Link>
            <DayLink date={shiftDate(date, 1)} label="Next day">
              <ChevronRight className="size-4" />
            </DayLink>
          </nav>
        }
      />

      <DayGrid
        date={date}
        timezone={profile.timezone}
        rows={rows}
        goals={goals}
        categories={categories}
        coverage={coverage}
        fidelity={fidelity}
      />
    </>
  );
}

function DayLink({
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
      href={`/today?date=${date}`}
      aria-label={label}
      title={label}
      className="flex size-7 items-center justify-center rounded-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
    >
      {children}
    </Link>
  );
}
