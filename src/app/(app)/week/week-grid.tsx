import Link from "next/link";

import { TAG_BG } from "@/components/ui/badge";
import type {
  Category,
  DayGridRow,
  Goal,
  NotionColor,
} from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { formatPercent } from "../dashboard/display";
import { clockLabel } from "../today/display";

export type CategoryOption = Pick<Category, "id" | "name" | "color">;
export type GoalOption = Pick<Goal, "id" | "title">;

export type WeekDay = {
  date: string;
  /** "Mon", and the day of the month. */
  weekday: string;
  dayOfMonth: string;
  isToday: boolean;
  /** After today. A day that has not happened has no coverage to report. */
  isFuture: boolean;
  rows: DayGridRow[];
  coverage: number | null;
  logged: number;
  expected: number;
  fidelity: number | null;
  honoured: number;
  planned: number;
};

/**
 * Seven days of the ledger, read-only.
 *
 * Carried over from Phase 2, where it was cut because the day grid is the
 * daily-use surface and a week view is a reporting one. It reads the same
 * `get_day_grid` the editor does — the dense projection, one row per slot of
 * each local day — so a week and a day can never disagree about what was
 * logged.
 *
 * Each day is two narrow columns, plan on the left and actual on the right,
 * because the whole reason both are stored is that their divergence is the only
 * measure of how well the user predicts themselves. Collapsing them into one
 * column here would hide exactly that.
 */
export function WeekGrid({
  days,
  categories,
  goals,
}: {
  days: WeekDay[];
  categories: CategoryOption[];
  goals: GoalOption[];
}) {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const goalById = new Map(goals.map((g) => [g.id, g]));

  /*
   * A day is as long as it really is — 96 slots, or 92 and 100 across a DST
   * transition. Taking the longest day in the week as the row count keeps the
   * columns aligned without ever truncating one; short days simply run out.
   */
  const rowCount = Math.max(...days.map((day) => day.rows.length));
  const labelSource = days.find((day) => day.rows.length === rowCount)!.rows;

  return (
    <div className="px-8 py-6">
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1">
            <div />
            {days.map((day) => (
              <DayHeader key={day.date} day={day} />
            ))}
          </div>

          <div className="mt-1 grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1">
            <div className="flex flex-col">
              {labelSource.map((row, index) =>
                // An hour label every four slots; anything denser is a wall.
                index % 4 === 0 ? (
                  <span
                    key={row.slot_start}
                    className="h-6 pr-1 text-right font-mono text-[10px] leading-6 text-text-tertiary"
                  >
                    {clockLabel(row.local_time)}
                  </span>
                ) : null,
              )}
            </div>

            {days.map((day) => (
              <div key={day.date} className="flex gap-px">
                <SlotColumn
                  rows={day.rows}
                  rowCount={rowCount}
                  kind="planned"
                  categoryById={categoryById}
                  goalById={goalById}
                />
                <SlotColumn
                  rows={day.rows}
                  rowCount={rowCount}
                  kind="actual"
                  categoryById={categoryById}
                  goalById={goalById}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 text-xs text-text-tertiary">
        Two columns per day: the plan on the left, what happened on the right.
        Dimmed rows are outside your waking window, which is the denominator
        coverage is measured against. Click a date to edit that day.
      </p>
    </div>
  );
}

function DayHeader({ day }: { day: WeekDay }) {
  return (
    <div className="min-w-0">
      <Link
        href={`/today?date=${day.date}`}
        className="block truncate rounded-sm px-1 py-0.5 transition-colors hover:bg-bg-hover"
      >
        <span
          className={cn(
            "text-xs",
            day.isToday ? "text-text" : "text-text-secondary",
          )}
        >
          {day.weekday}
        </span>{" "}
        <span
          className={cn(
            "font-mono text-xs",
            day.isToday ? "text-accent" : "text-text-tertiary",
          )}
        >
          {day.dayOfMonth}
        </span>
      </Link>
      {/*
       * Both figures come from day_coverage and day_fidelity via
       * adherence_series — the same definitions the dashboard reads. Nothing
       * here counts the cells beside it.
       *
       * A FUTURE DAY IS NOT A ZERO. The SQL correctly reports 0% coverage for a
       * day with nothing logged, and for a past day that is a real measurement.
       * For tomorrow it is an accusation about a day that has not happened, so
       * the column says so instead. Fidelity is different and stays as it is:
       * "no plan" on a future day is true and worth seeing, because it is still
       * possible to go and make one.
       */}
      <p
        className="px-1 font-mono text-[10px] text-text-tertiary"
        title={
          day.isFuture
            ? "This day has not happened yet, so there is nothing to account for."
            : `${day.logged} of ${day.expected} slots logged in the waking window`
        }
      >
        {day.isFuture ? (
          <span className="font-sans">upcoming</span>
        ) : (
          formatPercent(day.coverage)
        )}
      </p>
      <p
        className="px-1 text-[10px] text-text-tertiary"
        title={
          day.planned === 0
            ? "Nothing was planned for this day, so it has a fidelity of nothing."
            : `${day.honoured} of ${day.planned} planned slots honoured`
        }
      >
        {day.planned === 0 ? (
          "no plan"
        ) : (
          <span className="font-mono">{formatPercent(day.fidelity)}</span>
        )}
      </p>
    </div>
  );
}

function SlotColumn({
  rows,
  rowCount,
  kind,
  categoryById,
  goalById,
}: {
  rows: DayGridRow[];
  rowCount: number;
  kind: "planned" | "actual";
  categoryById: Map<string, CategoryOption>;
  goalById: Map<string, GoalOption>;
}) {
  return (
    <div className="flex flex-1 flex-col" aria-label={kind}>
      {Array.from({ length: rowCount }, (_, index) => {
        const row = rows[index];
        if (!row) {
          // A short day across a spring-forward transition. The hour does not
          // exist, so nothing is drawn for it.
          return <span key={index} className="h-1.5" />;
        }

        const categoryId =
          kind === "planned" ? row.planned_category_id : row.actual_category_id;
        const goalId =
          kind === "planned" ? row.planned_goal_id : row.actual_goal_id;
        const filled = kind === "planned" ? row.has_planned : row.has_actual;

        const category = categoryId ? categoryById.get(categoryId) : null;
        const goal = goalId ? goalById.get(goalId) : null;

        return (
          <span
            key={row.slot_start}
            title={
              filled
                ? `${clockLabel(row.local_time)} · ${category?.name ?? "Unclassified"}${goal ? ` · ${goal.title}` : ""}`
                : `${clockLabel(row.local_time)} · nothing logged`
            }
            className={cn(
              "h-1.5 w-full",
              !row.in_waking_window && "opacity-40",
              filled
                ? category
                  ? TAG_BG[category.color as NotionColor]
                  : "bg-border-strong"
                : "bg-bg-elevated",
            )}
          />
        );
      })}
    </div>
  );
}
