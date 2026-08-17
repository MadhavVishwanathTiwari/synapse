import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import type { PlanningBiasRow } from "@/lib/supabase/types";

import { formatBias } from "../today/display";
import { formatHours, NO_DATA, type Range, RANGE_LABEL, UNDEFINED_SENTENCE } from "./display";

/**
 * Planning bias — planned hours against actual hours, per category.
 *
 * Carried over from Phase 2, which built `planning_bias` and had nowhere
 * coherent to show it. It answers "which categories do I consistently
 * under-budget?", which is a different and more useful question than "did I
 * follow the plan today", and it only exists because both kinds of slot are
 * kept rather than the plan being overwritten at day close.
 *
 * The ratio is null where nothing was budgeted, and that is a state with a
 * meaning — you cannot be biased about a budget you never set — so it renders
 * as words rather than as a dash or a zero.
 */
export function BiasPanel({
  rows,
  range,
}: {
  rows: PlanningBiasRow[];
  range: Range;
}) {
  return (
    <Panel title={`Planning bias · ${RANGE_LABEL[range]}`}>
      {rows.length === 0 ? (
        <EmptyState
          title={NO_DATA.bias}
          description="Plan a day the night before, log what actually happened, and the gap between them shows up here."
        />
      ) : (
        <>
          <p className="text-xs text-text-secondary">
            Planned against actual. A positive figure means you spent more on a
            category than you budgeted for it.
          </p>

          <table className="mt-3 w-full text-xs tabular-nums">
            <thead className="text-left text-text-secondary">
              <tr className="border-b border-border">
                <th className="py-1.5 pr-2 font-medium">Category</th>
                <th className="py-1.5 pr-2 text-right font-medium">Planned</th>
                <th className="py-1.5 pr-2 text-right font-medium">Actual</th>
                <th className="py-1.5 text-right font-medium">Difference</th>
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
                  <td className="py-1.5 pr-2 text-right font-mono text-text-secondary">
                    {row.planned_hours === 0 ? (
                      <span
                        className="text-text-tertiary"
                        title={UNDEFINED_SENTENCE.bias}
                      >
                        not budgeted
                      </span>
                    ) : (
                      formatHours(row.planned_hours)
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-text">
                    {formatHours(row.actual_hours)}
                  </td>
                  <td className="py-1.5 text-right">
                    <Bias hours={row.bias_hours} budgeted={row.planned_hours > 0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-3 border-t border-border pt-2 text-xs text-text-tertiary">
            The unclassified row is included rather than dropped. It is usually
            where the bias is hiding.
          </p>
        </>
      )}
    </Panel>
  );
}

/**
 * The signed difference.
 *
 * Tone marks direction, not virtue: overspending on a category is not
 * automatically bad, and the colour says "over" or "under", nothing more. That
 * is why the sign is printed too — colour is never the only channel.
 */
function Bias({ hours, budgeted }: { hours: number; budgeted: boolean }) {
  if (!budgeted) {
    return <span className="text-text-tertiary">unbudgeted</span>;
  }

  // formatBias is the Phase 2 helper; the signed hour column is the same one
  // the ledger already knows how to print.
  const label = `${formatBias(hours)} h`;

  return (
    <span
      className={
        hours === 0
          ? "font-mono text-text-tertiary"
          : hours > 0
            ? "font-mono text-warning"
            : "font-mono text-text-secondary"
      }
    >
      {label}
    </span>
  );
}
