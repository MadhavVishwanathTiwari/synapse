"use client";

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
  adherencePoints,
  hasUnplannedDay,
  isolatedIndices,
  type AdherencePoint,
} from "@/lib/metrics/series";
import type { AdherenceSeriesRow } from "@/lib/supabase/types";

import {
  ChartToggle,
  isolatedDot,
  Legend,
  TOOLTIP_CLASS,
  useTableView,
} from "./chart-chrome";
import {
  dayLabel,
  formatScaledPercent,
  longDayLabel,
  NO_DATA,
  UNDEFINED_SENTENCE,
} from "./display";

/**
 * Coverage and fidelity over the range, as two lines on one 0–100% axis.
 *
 * Both are percentages of their own denominator, so they legitimately share an
 * axis — this is not a dual-axis chart, and it must never become one. If a third
 * measure in different units ever wants to be here, it gets its own panel.
 *
 * THE GAPS ARE THE FEATURE. `fidelity` is null on a day with no plan, and
 * `connectNulls` is left at its default of false so the line breaks there
 * instead of being drawn across. Setting it true — or mapping the null to zero
 * anywhere between the RPC and this component — would draw a measurement that
 * was never taken, on a day the user did nothing wrong.
 */
export function AdherenceTrend({ rows }: { rows: AdherenceSeriesRow[] }) {
  const [tableView, setTableView] = useTableView();
  const points = React.useMemo(() => adherencePoints(rows), [rows]);

  const anythingLogged = points.some((p) => p.logged > 0 || p.planned > 0);
  const hasGaps = hasUnplannedDay(rows);

  // Days whose neighbours are both undefined. Without these the series would be
  // a legend entry with nothing under it — see isolatedDot.
  const lonelyCoverage = React.useMemo(
    () => isolatedIndices(points.map((p) => p.coverage)),
    [points],
  );
  const lonelyFidelity = React.useMemo(
    () => isolatedIndices(points.map((p) => p.fidelity)),
    [points],
  );

  return (
    <Panel
      title="Adherence"
      actions={<ChartToggle value={tableView} onChange={setTableView} />}
    >
      <Legend
        items={[
          { label: "Coverage", color: "var(--color-series-1)" },
          { label: "Fidelity", color: "var(--color-series-2)" },
        ]}
      />

      {!anythingLogged ? (
        <EmptyState
          className="mt-3"
          title={NO_DATA.adherence}
          description="Paint slots on Today and this fills in from the day after."
        />
      ) : tableView ? (
        <TrendTable points={points} />
      ) : (
        <>
          <div className="mt-3 h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={points}
                margin={{ top: 8, right: 8, bottom: 4, left: -12 }}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--color-chart-grid)"
                />
                <XAxis
                  dataKey="day"
                  tickFormatter={dayLabel}
                  minTickGap={28}
                  tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
                  tickLine={false}
                  stroke="var(--color-chart-grid)"
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  tick={{ fill: "var(--color-text-tertiary)", fontSize: 11 }}
                  tickLine={false}
                  stroke="var(--color-chart-grid)"
                />
                <Tooltip content={<TrendTooltip />} cursor={{ stroke: "var(--color-border-strong)" }} />
                {/*
                 * type="linear", not "monotone". A smoothed curve puts the line
                 * at values between the points that were never measured, which
                 * is a small lie that this project has no appetite for.
                 */}
                <Line
                  type="linear"
                  dataKey="coverage"
                  name="Coverage"
                  stroke="var(--color-series-1)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  dot={isolatedDot(lonelyCoverage, "var(--color-series-1)")}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-bg-elevated)" }}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="fidelity"
                  name="Fidelity"
                  stroke="var(--color-series-2)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  dot={isolatedDot(lonelyFidelity, "var(--color-series-2)")}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-bg-elevated)" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {hasGaps ? (
            <p className="mt-2 text-xs text-text-tertiary">
              The fidelity line breaks on days with no plan. Those days have a
              fidelity of nothing rather than of zero, so the line stops instead
              of dropping.
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: AdherencePoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;

  return (
    <div className={TOOLTIP_CLASS}>
      <p className="text-text">{longDayLabel(point.day)}</p>
      <p className="mt-1 text-text-secondary">
        Coverage{" "}
        <span className="font-mono text-text">
          {formatScaledPercent(point.coverage)}
        </span>{" "}
        <span className="font-mono text-text-tertiary">
          ({point.logged} of {point.expected} slots)
        </span>
      </p>
      {point.fidelity === null ? (
        // The tooltip is where the reason for the break belongs. A gap with no
        // explanation reads as missing data rather than as an absent plan.
        <p className="mt-0.5 max-w-[34ch] text-text-tertiary">
          {UNDEFINED_SENTENCE.fidelity}
        </p>
      ) : (
        <p className="mt-0.5 text-text-secondary">
          Fidelity{" "}
          <span className="font-mono text-text">
            {formatScaledPercent(point.fidelity)}
          </span>{" "}
          <span className="font-mono text-text-tertiary">
            ({point.honoured} of {point.planned} planned)
          </span>
        </p>
      )}
    </div>
  );
}

/** The table twin. Every value on the chart is reachable without hovering. */
function TrendTable({ points }: { points: AdherencePoint[] }) {
  return (
    <div className="mt-3 max-h-[240px] overflow-y-auto">
      <table className="w-full text-xs tabular-nums">
        <thead className="sticky top-0 bg-bg-elevated text-left text-text-secondary">
          <tr className="border-b border-border">
            <th className="py-1.5 pr-2 font-medium">Day</th>
            <th className="py-1.5 pr-2 text-right font-medium">Coverage</th>
            <th className="py-1.5 pr-2 text-right font-medium">Logged</th>
            <th className="py-1.5 pr-2 text-right font-medium">Fidelity</th>
            <th className="py-1.5 text-right font-medium">Honoured</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day} className="border-b border-border last:border-b-0">
              <td className="py-1.5 pr-2 text-text-secondary">
                {dayLabel(point.day)}
              </td>
              <td className="py-1.5 pr-2 text-right font-mono text-text">
                {formatScaledPercent(point.coverage)}
              </td>
              <td className="py-1.5 pr-2 text-right font-mono text-text-tertiary">
                {point.logged}/{point.expected}
              </td>
              <td
                className={
                  point.fidelity === null
                    ? "py-1.5 pr-2 text-right text-text-tertiary"
                    : "py-1.5 pr-2 text-right font-mono text-text"
                }
                title={point.fidelity === null ? UNDEFINED_SENTENCE.fidelity : undefined}
              >
                {point.fidelity === null
                  ? "no plan"
                  : formatScaledPercent(point.fidelity)}
              </td>
              <td className="py-1.5 text-right font-mono text-text-tertiary">
                {point.planned === 0 ? "—" : `${point.honoured}/${point.planned}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
