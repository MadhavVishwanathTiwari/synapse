import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import type { AllocationRow, AllocationSummary } from "@/lib/supabase/types";

import {
  ALLOCATION_CAVEAT,
  formatHours,
  formatPercent,
  NO_DATA,
  type Range,
  RANGE_LABEL,
} from "./display";

/**
 * Where the hours went over the range.
 *
 * A table rather than a pie: these are close values that want comparing, and a
 * donut for close values is unreadable. The bar beside each row is a mark, not
 * the reading — the number is right there.
 *
 * THE UNCATEGORISED ROW IS KEPT. Dropping it would make the shares fail to sum
 * to the range, and unclassified time is usually where the interesting answer
 * is. It carries no productive flag, because there is none — "unclassified" and
 * "unproductive" are different claims and the column says so in words.
 */
export function AllocationPanel({
  rows,
  summary,
  range,
}: {
  rows: AllocationRow[];
  summary: AllocationSummary | null;
  range: Range;
}) {
  return (
    <Panel title={`Where the hours went · ${RANGE_LABEL[range]}`}>
      {rows.length === 0 || !summary || summary.logged_hours === 0 ? (
        <EmptyState
          title={NO_DATA.allocation}
          description="Paint slots on Today and they are attributed here by category."
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 border-b border-border pb-3">
            <Total label="Productive" value={formatHours(summary.productive_hours)} />
            <Total label="Not productive" value={formatHours(summary.unproductive_hours)} />
            <Total
              label="Unclassified"
              value={formatHours(summary.unclassified_hours)}
              muted
            />
          </div>

          <p className="mt-2 text-xs text-text-secondary">
            <span className="font-mono text-text">
              {formatPercent(summary.productive_share)}
            </span>{" "}
            of {formatHours(summary.logged_hours)} logged went to a category you
            marked productive. Unclassified time is counted in that denominator,
            not excluded from it.
          </p>

          <table className="mt-3 w-full text-xs tabular-nums">
            <thead className="text-left text-text-secondary">
              <tr className="border-b border-border">
                <th className="py-1.5 pr-2 font-medium">Category</th>
                <th className="py-1.5 pr-2 font-medium">Kind</th>
                <th className="py-1.5 pr-2 text-right font-medium">Hours</th>
                <th className="w-[38%] py-1.5 text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.category_id ?? "uncategorised"}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="py-1.5 pr-2 text-text">
                    {row.category_name ?? (
                      <span className="text-text-tertiary">Unclassified</span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-text-tertiary">
                    {row.is_productive === null
                      ? "no flag"
                      : row.is_productive
                        ? "productive"
                        : "not productive"}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-text">
                    {formatHours(row.actual_hours)}
                  </td>
                  <td className="py-1.5">
                    <div className="flex items-center justify-end gap-2">
                      <ShareBar share={row.share} />
                      <span className="w-9 shrink-0 text-right font-mono text-text-secondary">
                        {formatPercent(row.share)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-3 border-t border-border pt-2 text-xs text-text-tertiary">
            {ALLOCATION_CAVEAT}
          </p>
        </>
      )}
    </Panel>
  );
}

function Total({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-text-secondary">{label}</p>
      <p
        className={
          muted
            ? "mt-0.5 font-mono text-sm text-text-tertiary"
            : "mt-0.5 font-mono text-sm text-text"
        }
      >
        {value}
      </p>
    </div>
  );
}

/**
 * One thin bar, one colour for every row.
 *
 * Deliberately not a value-ramp: categories have no natural order, and shading
 * each bar darker-where-bigger would double-encode length as hue and burn the
 * only free channel on information the bar already shows.
 */
function ShareBar({ share }: { share: number | null }) {
  if (share === null) return null;
  return (
    <span
      aria-hidden
      className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-bg-hover"
    >
      {/* Geometry, not a reading. The figure itself is in the cell beside it. */}
      <span
        className="block h-full rounded-full bg-series-1"
        style={{ width: `${share * 100}%` }}
      />
    </span>
  );
}
