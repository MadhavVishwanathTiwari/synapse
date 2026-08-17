import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import type { GoalSeries } from "@/lib/metrics/series";
import { createClient } from "@/lib/supabase/server";
import type {
  AdherenceSeriesRow,
  AllocationRow,
  AllocationSummary,
  AttentionRow,
  DayCoverage,
  DayFidelity,
  EffortOutcomeRow,
  Goal,
  PlanningBiasRow,
} from "@/lib/supabase/types";

import { todayIn } from "../today/display";
import { AdherenceTrend } from "./adherence-trend";
import { AllocationPanel } from "./allocation-panel";
import { AttentionBadge, AttentionPanel } from "./attention-panel";
import { BiasPanel } from "./bias-panel";
import { DivergenceChart, type GoalOption } from "./divergence-chart";
import {
  MAX_SELECTED,
  normaliseRange,
  RANGE_LABEL,
  rangeStart,
} from "./display";
import { RangeSelect } from "./range-select";
import { TodayNumbers } from "./today-numbers";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The dashboard.
 *
 * EVERY FIGURE ON THIS PAGE COMES FROM A SQL FUNCTION. There is no arithmetic
 * in this directory that is not formatting or a date shift — hard rule 1, and
 * the acceptance criterion for this phase. If a number needs computing, it
 * needs a migration, because the Phase 5 nudge engine has to be able to read
 * the same definition.
 *
 * The second rule this page is built around is hard rule 8: several of these
 * metrics are undefined rather than zero under conditions the generated types
 * will not remind anyone about — fidelity on a day with no plan, allocation
 * over an empty range, pace rates in five of eight statuses. Every one of them
 * reaches the screen as a sentence saying why, never as a dash on its own.
 */
export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const supabase = await createClient();
  const params = await searchParams;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("timezone")
    .single();

  if (!profile) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div className="px-8 py-6">
          <p role="alert" className="text-sm text-danger">
            Could not load your profile
            {profileError ? `: ${profileError.message}` : ""}. Every figure here
            is projected through your timezone, so none of them can be computed
            without it.
          </p>
        </div>
      </>
    );
  }

  const range = normaliseRange(params.range);
  const today = todayIn(profile.timezone);
  const from = rangeStart(today, range);

  const [
    coverageRes,
    fidelityRes,
    todayAllocationRes,
    seriesRes,
    allocationRes,
    allocationSummaryRes,
    biasRes,
    attentionRes,
    goalsRes,
  ] = await Promise.all([
    supabase.rpc("day_coverage", { p_date: today }),
    supabase.rpc("day_fidelity", { p_date: today }),
    supabase.rpc("allocation_summary", { p_from: today, p_to: today }),
    supabase.rpc("adherence_series", { p_from: from, p_to: today }),
    supabase.rpc("allocation", { p_from: from, p_to: today }),
    supabase.rpc("allocation_summary", { p_from: from, p_to: today }),
    supabase.rpc("planning_bias", { p_from: from, p_to: today }),
    supabase.rpc("goals_needing_attention", { p_as_of: today }),
    supabase
      .from("goals")
      .select("id, title, metric_unit, horizon")
      .neq("status", "abandoned")
      .not("metric_unit", "is", null)
      .order("horizon", { ascending: false })
      .order("title"),
  ]);

  /*
   * Surfaced, not swallowed. An empty panel and a failed query look identical,
   * and a silent zero is exactly the confusion this project exists to remove —
   * see docs/CONVENTIONS.md, Errors.
   */
  const failure = [
    coverageRes.error,
    fidelityRes.error,
    todayAllocationRes.error,
    seriesRes.error,
    allocationRes.error,
    allocationSummaryRes.error,
    biasRes.error,
    attentionRes.error,
    goalsRes.error,
  ].find(Boolean);

  if (failure) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div className="px-8 py-6">
          <p role="alert" className="text-sm text-danger">
            Could not load the dashboard: {failure.message}
          </p>
        </div>
      </>
    );
  }

  // Nullable in reality, non-null in the generated types — Postgres records no
  // nullability on a function's OUT parameters. See lib/supabase/types.
  const coverage = (coverageRes.data?.[0] ?? null) as DayCoverage | null;
  const fidelity = (fidelityRes.data?.[0] ?? null) as DayFidelity | null;
  const todayAllocation = (todayAllocationRes.data?.[0] ??
    null) as AllocationSummary | null;
  const adherence = (seriesRes.data ?? []) as unknown as AdherenceSeriesRow[];
  const allocationRows = (allocationRes.data ?? []) as unknown as AllocationRow[];
  const allocationSummary = (allocationSummaryRes.data?.[0] ??
    null) as AllocationSummary | null;
  const bias = (biasRes.data ?? []) as unknown as PlanningBiasRow[];
  const attention = (attentionRes.data ?? []) as unknown as AttentionRow[];

  const options: GoalOption[] = (
    (goalsRes.data ?? []) as Pick<Goal, "id" | "title" | "metric_unit">[]
  ).map((goal) => ({
    goalId: goal.id,
    title: goal.title,
    metricUnit: goal.metric_unit,
  }));

  const selected = resolveSelection(params.goals, options);

  // One round trip per selected goal, capped at four by the picker. The series
  // is per-goal because the weighting is per-goal; there is no shape that would
  // let one query answer for several without flattening them together.
  const selectedSeries = await Promise.all(
    selected.map(async (goalId): Promise<GoalSeries | null> => {
      const option = options.find((o) => o.goalId === goalId);
      if (!option) return null;

      const { data, error } = await supabase.rpc("effort_outcome_series", {
        p_goal_id: goalId,
        p_from: from,
        p_to: today,
      });
      if (error) return null;

      return {
        goalId,
        title: option.title,
        metricUnit: option.metricUnit,
        rows: (data ?? []) as unknown as EffortOutcomeRow[],
      };
    }),
  );

  const series = selectedSeries.filter((s): s is GoalSeries => s !== null);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Everything here traces to a SQL definition. ${RANGE_LABEL[range]} to ${today}.`}
        actions={<AttentionBadge rows={attention} />}
      />

      <div className="flex flex-col gap-6 px-8 py-6">
        {/*
         * One filter row, above everything it scopes. A per-panel range control
         * would let two figures on the same screen describe different windows.
         */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">
            Today is {today}; the range below covers {from} to {today}.
          </p>
          <RangeSelect value={range} />
        </div>

        <TodayNumbers
          coverage={coverage}
          fidelity={fidelity}
          allocation={todayAllocation}
        />

        <AdherenceTrend rows={adherence} />

        <div className="grid gap-4 lg:grid-cols-2">
          <AttentionPanel rows={attention} />
          <AllocationPanel
            rows={allocationRows}
            summary={allocationSummary}
            range={range}
          />
        </div>

        <DivergenceChart
          options={options}
          series={series}
          selected={selected}
        />

        <BiasPanel rows={bias} range={range} />
      </div>
    </>
  );
}

/**
 * Which goals the divergence chart draws.
 *
 * The selection lives in the URL so the page stays server-rendered. With no
 * parameter it falls back to the first option rather than to nothing, because
 * an empty chart on first visit reads as a broken one.
 */
function resolveSelection(
  raw: string | string[] | undefined,
  options: GoalOption[],
): string[] {
  if (options.length === 0) return [];

  if (typeof raw !== "string") {
    return [options[0].goalId];
  }

  const wanted = new Set(raw.split(",").filter(Boolean));
  const valid = options
    .filter((option) => wanted.has(option.goalId))
    .map((option) => option.goalId);

  return valid.slice(0, MAX_SELECTED);
}
