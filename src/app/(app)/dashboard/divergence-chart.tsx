"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import {
  effortKey,
  isolatedIndices,
  mergeDivergence,
  outcomeKey,
  type DivergencePoint,
  type GoalSeries,
} from "@/lib/metrics/series";

import {
  ChartToggle,
  isolatedDot,
  Legend,
  TOOLTIP_CLASS,
  useTableView,
} from "./chart-chrome";
import {
  dayLabel,
  formatHours,
  formatValue,
  longDayLabel,
  MAX_SELECTED,
  NO_DATA,
  UNDEFINED_SENTENCE,
} from "./display";

/**
 * Effort against outcome — the ADR 004 view, and the reason the two rollups are
 * kept apart.
 *
 * THE TWO ARE NEVER COMBINED. No blended completion figure is computed here,
 * because the signal is the gap: effort climbing against a flat outcome means
 * the strategy is wrong, and any weighted average of the two destroys exactly
 * that. This is also why there is no dual-axis version of this chart — putting
 * hours and rupees on one plot with two scales lets the reader see a
 * correlation whose alignment was chosen arbitrarily.
 *
 * So the layout is two stacked plots over one shared time axis:
 *
 *   EFFORT   every selected goal on one chart. All of them are hours, so they
 *            are genuinely comparable and belong together.
 *
 *   OUTCOME  one small chart per goal, each with its own axis in that goal's
 *            own unit. Rupees and kilograms cannot share a scale, and indexing
 *            them to a common base would make the chart look right while
 *            asserting a comparison the data cannot support.
 *
 * Selecting a single goal collapses this to the obvious thing: one effort line
 * above one outcome line.
 */

/** The four validated series slots. Assigned by the goal's stable position in
 * the option list, never by its rank in the current selection — a reader who
 * learned which colour a goal is must not have it repainted by a filter. */
const SERIES_SLOTS = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
] as const;

export type GoalOption = {
  goalId: string;
  title: string;
  metricUnit: string | null;
};

export function DivergenceChart({
  options,
  series,
  selected,
}: {
  /** Every goal with effort or progress in the range, in a stable order. */
  options: GoalOption[];
  /** The series for the selected goals, in the same order as `selected`. */
  series: GoalSeries[];
  selected: string[];
}) {
  const [tableView, setTableView] = useTableView();

  const colourOf = React.useCallback(
    (goalId: string) => {
      const index = options.findIndex((o) => o.goalId === goalId);
      return SERIES_SLOTS[(index < 0 ? 0 : index) % SERIES_SLOTS.length];
    },
    [options],
  );

  const points = React.useMemo(() => mergeDivergence(series), [series]);

  if (options.length === 0) {
    return (
      <Panel title="Effort against outcome">
        <EmptyState
          title={NO_DATA.divergence}
          description="Log time against a goal on Today, or enter progress on a goal, and both series appear here."
        />
      </Panel>
    );
  }

  const colours = series.map((s) => colourOf(s.goalId));
  const collides = new Set(colours).size < colours.length;

  return (
    <Panel
      title="Effort against outcome"
      actions={<ChartToggle value={tableView} onChange={setTableView} />}
    >
      <GoalPicker options={options} selected={selected} colourOf={colourOf} />

      <p className="mt-2 text-xs text-text-tertiary">
        Two independent series, never combined into a completion figure. Effort
        is exact, from the ledger; outcome is what you measured and entered
        against the goal itself, not derived from the goals beneath it.
      </p>

      {series.length === 0 ? (
        <EmptyState
          className="mt-3"
          title="No goal selected."
          description="Pick a goal above to see its effort and its measured outcome side by side."
        />
      ) : tableView ? (
        <DivergenceTable points={points} series={series} />
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {collides ? (
            <p className="text-xs text-warning">
              Two of the selected goals share a colour. Deselect one for a
              clearer read of the effort chart.
            </p>
          ) : null}

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <p className="text-xs text-text-secondary">
                Effort, cumulative hours in this range
              </p>
              <Legend
                items={series.map((s) => ({
                  label: s.title,
                  color: colourOf(s.goalId),
                }))}
              />
            </div>
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={points}
                  margin={{ top: 8, right: 8, bottom: 4, left: -8 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={dayLabel}
                    minTickGap={28}
                    tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
                    tickLine={false}
                    stroke="var(--color-chart-grid)"
                  />
                  <YAxis
                    tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
                    tickLine={false}
                    stroke="var(--color-chart-grid)"
                    width={44}
                  />
                  <Tooltip
                    content={<EffortTooltip series={series} />}
                    cursor={{ stroke: "var(--color-border-strong)" }}
                  />
                  {series.map((s) => (
                    <Line
                      key={s.goalId}
                      type="linear"
                      dataKey={effortKey(s.goalId)}
                      name={s.title}
                      stroke={colourOf(s.goalId)}
                      strokeWidth={2}
                      strokeLinecap="round"
                      dot={false}
                      activeDot={{
                        r: 4,
                        strokeWidth: 2,
                        stroke: "var(--color-bg-elevated)",
                      }}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <OutcomePlots points={points} series={series} colourOf={colourOf} />
        </div>
      )}
    </Panel>
  );
}

/**
 * One small chart per goal, each on its own axis in its own unit.
 *
 * A goal with no unit has no outcome to plot at all — it says so rather than
 * drawing an empty frame, because an empty frame reads as a chart that failed
 * to load.
 */
function OutcomePlots({
  points,
  series,
  colourOf,
}: {
  points: DivergencePoint[];
  series: GoalSeries[];
  colourOf: (goalId: string) => string;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <p className="text-xs text-text-secondary">
        Outcome, cumulative measured progress in this range
        {series.length > 1 ? (
          <span className="text-text-tertiary">
            {" "}
            — one plot per goal, because two units cannot share an axis
          </span>
        ) : null}
      </p>

      <div
        className={
          series.length > 1
            ? "grid gap-3 sm:grid-cols-2"
            : "grid gap-3"
        }
      >
        {series.map((s) => {
          const values = points.map(
            (p) => p[outcomeKey(s.goalId)] as number | null,
          );
          const measured = values.some((v) => v !== null && v !== undefined);
          // A goal measured once in the range is one point, and one point draws
          // no line at all. See isolatedDot.
          const lonely = isolatedIndices(values);

          return (
            <div key={s.goalId} className="rounded-md border border-border p-2.5">
              <p className="flex items-center gap-1.5 text-xs text-text-secondary">
                <span
                  aria-hidden
                  className="h-0.5 w-4 shrink-0 rounded-full"
                  style={{ backgroundColor: colourOf(s.goalId) }}
                />
                <span className="truncate text-text">{s.title}</span>
                {s.metricUnit ? (
                  <span className="shrink-0 text-text-tertiary">
                    {s.metricUnit}
                  </span>
                ) : null}
              </p>

              {!s.metricUnit ? (
                <p className="mt-2 text-xs text-text-tertiary">
                  This goal has no unit, so there is no outcome to measure. Its
                  effort still counts above.
                </p>
              ) : !measured ? (
                <p className="mt-2 text-xs text-text-tertiary">
                  {UNDEFINED_SENTENCE.outcome}
                </p>
              ) : (
                <div className="mt-1.5 h-[120px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={points}
                      margin={{ top: 6, right: 6, bottom: 0, left: -8 }}
                    >
                      <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
                      <XAxis
                        dataKey="day"
                        tickFormatter={dayLabel}
                        minTickGap={28}
                        tick={{ fill: "var(--color-text-tertiary)", fontSize: 10 }}
                        tickLine={false}
                        stroke="var(--color-chart-grid)"
                      />
                      <YAxis
                        tick={{ fill: "var(--color-text-tertiary)", fontSize: 10 }}
                        tickLine={false}
                        stroke="var(--color-chart-grid)"
                        width={44}
                      />
                      <Tooltip
                        content={<OutcomeTooltip goal={s} />}
                        cursor={{ stroke: "var(--color-border-strong)" }}
                      />
                      {/*
                       * connectNulls stays false. The line starts at the first
                       * real measurement instead of being drawn back to a zero
                       * nobody entered.
                       */}
                      <Line
                        type="linear"
                        dataKey={outcomeKey(s.goalId)}
                        name={s.title}
                        stroke={colourOf(s.goalId)}
                        strokeWidth={2}
                        strokeLinecap="round"
                        dot={isolatedDot(lonely, colourOf(s.goalId))}
                        activeDot={{
                          r: 4,
                          strokeWidth: 2,
                          stroke: "var(--color-bg-elevated)",
                        }}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GoalPicker({
  options,
  selected,
  colourOf,
}: {
  options: GoalOption[];
  selected: string[];
  colourOf: (goalId: string) => string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefToggling = (goalId: string) => {
    const on = selected.includes(goalId);
    const next = on
      ? selected.filter((id) => id !== goalId)
      : [...selected, goalId].slice(-MAX_SELECTED);

    const search = new URLSearchParams(params);
    if (next.length === 0) search.delete("goals");
    else search.set("goals", next.join(","));
    return `${pathname}?${search.toString()}`;
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((option) => {
        const on = selected.includes(option.goalId);
        return (
          <Link
            key={option.goalId}
            href={hrefToggling(option.goalId)}
            aria-pressed={on}
            scroll={false}
            className={
              on
                ? "flex items-center gap-1.5 rounded-sm border border-border-strong bg-bg-active px-2 py-1 text-xs text-text"
                : "flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
            }
          >
            <span
              aria-hidden
              className="h-0.5 w-3 rounded-full"
              style={{
                backgroundColor: on
                  ? colourOf(option.goalId)
                  : "var(--color-text-tertiary)",
              }}
            />
            <span className="max-w-[22ch] truncate">{option.title}</span>
            {option.metricUnit ? null : (
              <span className="text-text-tertiary" title="No unit, so no outcome series">
                effort only
              </span>
            )}
          </Link>
        );
      })}
      <span className="ml-1 text-xs text-text-tertiary">
        up to {MAX_SELECTED}
      </span>
    </div>
  );
}

function EffortTooltip({
  active,
  payload,
  series,
}: {
  active?: boolean;
  payload?: { payload: DivergencePoint }[];
  series?: GoalSeries[];
}) {
  if (!active || !payload?.length || !series) return null;
  const point = payload[0].payload;

  return (
    <div className={TOOLTIP_CLASS}>
      <p className="text-text">{longDayLabel(String(point.day))}</p>
      {series.map((s) => (
        <p key={s.goalId} className="mt-0.5 text-text-secondary">
          <span className="max-w-[24ch] truncate">{s.title}</span>{" "}
          <span className="font-mono text-text">
            {formatHours(point[effortKey(s.goalId)] as number | null)}
          </span>
        </p>
      ))}
    </div>
  );
}

function OutcomeTooltip({
  active,
  payload,
  goal,
}: {
  active?: boolean;
  payload?: { payload: DivergencePoint }[];
  goal?: GoalSeries;
}) {
  if (!active || !payload?.length || !goal) return null;
  const point = payload[0].payload;
  const value = point[outcomeKey(goal.goalId)] as number | null;

  return (
    <div className={TOOLTIP_CLASS}>
      <p className="text-text">{longDayLabel(String(point.day))}</p>
      <p className="mt-0.5 text-text-secondary">
        <span className="font-mono text-text">{formatValue(value)}</span>{" "}
        {goal.metricUnit}
      </p>
    </div>
  );
}

/** The table twin. Effort and outcome stay in separate columns, never summed. */
function DivergenceTable({
  points,
  series,
}: {
  points: DivergencePoint[];
  series: GoalSeries[];
}) {
  return (
    <div className="mt-3 max-h-[320px] overflow-x-auto overflow-y-auto">
      <table className="w-full text-xs tabular-nums">
        <thead className="sticky top-0 bg-bg-elevated text-left text-text-secondary">
          <tr className="border-b border-border">
            <th className="py-1.5 pr-2 font-medium">Day</th>
            {series.map((s) => (
              <React.Fragment key={s.goalId}>
                <th className="py-1.5 pr-2 text-right font-medium whitespace-nowrap">
                  {s.title} · hours
                </th>
                <th className="py-1.5 pr-2 text-right font-medium whitespace-nowrap">
                  {s.title} · {s.metricUnit ?? "no unit"}
                </th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr
              key={String(point.day)}
              className="border-b border-border last:border-b-0"
            >
              <td className="py-1.5 pr-2 text-text-secondary whitespace-nowrap">
                {dayLabel(String(point.day))}
              </td>
              {series.map((s) => {
                const outcome = point[outcomeKey(s.goalId)] as number | null;
                return (
                  <React.Fragment key={s.goalId}>
                    <td className="py-1.5 pr-2 text-right font-mono text-text">
                      {formatValue(point[effortKey(s.goalId)] as number | null)}
                    </td>
                    <td
                      className={
                        outcome === null
                          ? "py-1.5 pr-2 text-right text-text-tertiary"
                          : "py-1.5 pr-2 text-right font-mono text-text"
                      }
                      title={outcome === null ? UNDEFINED_SENTENCE.outcome : undefined}
                    >
                      {outcome === null ? "not measured" : formatValue(outcome)}
                    </td>
                  </React.Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
