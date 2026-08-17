"use client";

import { Plus } from "lucide-react";
import * as React from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { GOAL_HORIZONS, type GoalHorizon, type GoalOverview } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { formatNumber, formatShortDate, HORIZON_LABEL, STATUS_LABEL } from "./display";
import { GoalCard } from "./goal-card";
import { NewGoalDialog } from "./new-goal-dialog";

type Filter = "all" | GoalHorizon;

/**
 * Six columns, or one horizon as a dense table.
 *
 * Both views render from the same array — switching is local state, not a
 * refetch, because the whole set is small enough to hold and the flicker of a
 * round-trip would make the switcher feel broken.
 */
export function HorizonBoard({ goals }: { goals: GoalOverview[] }) {
  const [filter, setFilter] = React.useState<Filter>("all");

  const byHorizon = React.useMemo(() => {
    const map = new Map<GoalHorizon, GoalOverview[]>(
      GOAL_HORIZONS.map((h) => [h, []]),
    );
    for (const goal of goals) map.get(goal.horizon)?.push(goal);
    return map;
  }, [goals]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 overflow-x-auto">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </FilterChip>
        {GOAL_HORIZONS.map((h) => (
          <FilterChip
            key={h}
            active={filter === h}
            onClick={() => setFilter(h)}
          >
            {HORIZON_LABEL[h]}
            <span className="ml-1.5 font-mono text-text-tertiary">
              {byHorizon.get(h)?.length ?? 0}
            </span>
          </FilterChip>
        ))}
      </div>

      {filter === "all" ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {GOAL_HORIZONS.map((h) => (
            <Column key={h} horizon={h} goals={byHorizon.get(h) ?? []} />
          ))}
        </div>
      ) : (
        <HorizonTable horizon={filter} goals={byHorizon.get(filter) ?? []} />
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-sm px-2.5 py-1 text-xs transition-colors",
        active
          ? "bg-bg-active text-text"
          : "text-text-secondary hover:bg-bg-hover hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function Column({
  horizon,
  goals,
}: {
  horizon: GoalHorizon;
  goals: GoalOverview[];
}) {
  return (
    <section className="flex w-[280px] shrink-0 flex-col gap-2">
      <header className="flex items-center justify-between px-0.5">
        <h2 className="text-xs font-medium tracking-wide text-text-secondary uppercase">
          {HORIZON_LABEL[horizon]}
          <span className="ml-2 font-mono text-text-tertiary">{goals.length}</span>
        </h2>
        <NewGoalDialog
          horizon={horizon}
          trigger={
            <button
              type="button"
              aria-label={`New ${HORIZON_LABEL[horizon].toLowerCase()} goal`}
              className="rounded-sm p-1 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text"
            >
              <Plus className="size-3.5" />
            </button>
          }
        />
      </header>

      {goals.length === 0 ? (
        <EmptyState
          title={`No ${HORIZON_LABEL[horizon].toLowerCase()} goals`}
          description={
            horizon === "day"
              ? "Tasks live here — a task is a goal at the day horizon."
              : undefined
          }
          className="py-6"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {goals.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </div>
      )}
    </section>
  );
}

function HorizonTable({
  horizon,
  goals,
}: {
  horizon: GoalHorizon;
  goals: GoalOverview[];
}) {
  if (goals.length === 0) {
    return (
      <EmptyState
        title={`No ${HORIZON_LABEL[horizon].toLowerCase()} goals yet`}
        action={<NewGoalDialog horizon={horizon} />}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-secondary">
            <th className="px-3 py-2 font-medium">Goal</th>
            <th className="px-3 py-2 font-medium">Progress</th>
            <th className="px-3 py-2 font-medium">Due</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Links</th>
          </tr>
        </thead>
        <tbody>
          {goals.map((goal) => (
            <tr
              key={goal.id}
              className="border-b border-border last:border-0 hover:bg-bg-hover"
            >
              <td className="px-3 py-2">
                <a href={`/goals/${goal.id}`} className="text-text hover:underline">
                  {goal.title}
                </a>
                {goal.is_blocked ? (
                  <span className="ml-2 text-xs text-warning">blocked</span>
                ) : null}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-text-secondary">
                {goal.metric_unit && goal.target_value !== null
                  ? `${formatNumber(goal.progress_total)} / ${formatNumber(goal.target_value)} ${goal.metric_unit}`
                  : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-text-secondary">
                {formatShortDate(goal.due_date)}
              </td>
              <td className="px-3 py-2 text-xs text-text-secondary">
                {STATUS_LABEL[goal.status]}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs text-text-tertiary">
                {goal.child_count} / {goal.parent_count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
