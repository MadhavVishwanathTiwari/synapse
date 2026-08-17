"use client";

import { BarChart3, Table2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The pieces every chart on this page shares.
 *
 * Two rules from the visualisation guidance are enforced here rather than
 * remembered at each call site:
 *
 *   - A legend is always present for two or more series, so identity never
 *     depends on matching colours by eye.
 *   - Every chart has a table twin. A tooltip may enhance a value but must
 *     never be the only way to read it, and this page's whole claim is that
 *     each figure is auditable.
 *
 * Text never wears the series colour. The swatch beside a label carries the
 * identity; the label itself stays in a text token, because a categorical hue
 * chosen to be legible as a 2px line is not legible as 11px text.
 */

export function useTableView() {
  return React.useState(false);
}

export function ChartToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-sm border border-border p-0.5"
      role="group"
      aria-label="View as"
    >
      <button
        type="button"
        onClick={() => onChange(false)}
        aria-pressed={!value}
        aria-label="Chart"
        title="Chart"
        className={cn(
          "flex size-6 items-center justify-center rounded-sm transition-colors",
          value
            ? "text-text-tertiary hover:bg-bg-hover hover:text-text"
            : "bg-bg-active text-text",
        )}
      >
        <BarChart3 className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        aria-pressed={value}
        aria-label="Table"
        title="Table"
        className={cn(
          "flex size-6 items-center justify-center rounded-sm transition-colors",
          value
            ? "bg-bg-active text-text"
            : "text-text-tertiary hover:bg-bg-hover hover:text-text",
        )}
      >
        <Table2 className="size-3.5" />
      </button>
    </div>
  );
}

export type LegendItem = {
  label: string;
  color: string;
  /** A dashed key marks a series drawn as a dashed line, e.g. a second measure. */
  dashed?: boolean;
};

export function Legend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;

  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <li
          key={item.label}
          className="flex items-center gap-1.5 text-xs text-text-secondary"
        >
          <span
            aria-hidden
            className="h-0.5 w-4 rounded-full"
            style={
              item.dashed
                ? {
                    backgroundImage: `repeating-linear-gradient(90deg, ${item.color} 0 4px, transparent 4px 7px)`,
                  }
                : { backgroundColor: item.color }
            }
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** One tooltip surface for every chart, so they cannot drift apart. */
export const TOOLTIP_CLASS =
  "rounded-md border border-border bg-bg-elevated px-2.5 py-2 text-xs shadow-lg";

/**
 * A dot for points a line cannot reach.
 *
 * Segments are drawn between adjacent points, so a value whose neighbours are
 * both null yields no geometry — and with dots off the whole series disappears
 * while its legend entry still promises it. On this app's data that is the
 * ordinary case: fidelity is null on every unplanned day, so a month with one
 * planned day has a one-point series.
 *
 * Only the isolated points get a dot. Marking every point would put a number's
 * worth of ink on days that are already joined by a line, which is the noise the
 * `dot={false}` default exists to avoid.
 *
 * The 2px ring in the surface colour is the standard mark spec — it keeps the
 * dot legible where it crosses another series.
 */
export function isolatedDot(isolated: Set<number>, color: string) {
  return function IsolatedDot(props: {
    cx?: number;
    cy?: number;
    index?: number;
  }) {
    const { cx, cy, index } = props;

    if (
      cx === undefined ||
      cy === undefined ||
      index === undefined ||
      !isolated.has(index)
    ) {
      // Recharts wants an element back, not null.
      return <g />;
    }

    return (
      <circle
        cx={cx}
        cy={cy}
        r={3}
        fill={color}
        stroke="var(--color-bg-elevated)"
        strokeWidth={2}
      />
    );
  };
}
