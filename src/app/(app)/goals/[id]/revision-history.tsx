import { EmptyState } from "@/components/ui/empty-state";
import type { GoalRevision } from "@/lib/supabase/types";

import { formatDate } from "../display";
import { Panel } from "./panel";

const FIELD_LABEL: Record<string, string> = {
  target_value: "Target",
  due_date: "Deadline",
  status: "Status",
};

/**
 * The append-only revision log.
 *
 * This is what makes pace for a past date honest — see docs/DECISIONS.md 006.
 * Rows cannot be edited or removed from the app: the table has no insert, update
 * or delete policy, and only the trigger writes it.
 */
export function RevisionHistory({ revisions }: { revisions: GoalRevision[] }) {
  if (revisions.length === 0) {
    return (
      <Panel title="Revision history">
        <EmptyState
          title="No revisions"
          description="This goal's target and deadline have not moved."
        />
      </Panel>
    );
  }

  return (
    <Panel title="Revision history">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="py-1.5 pr-3 font-medium">Field</th>
              <th className="py-1.5 pr-3 font-medium">Change</th>
              <th className="py-1.5 pr-3 font-medium">Reason</th>
              <th className="py-1.5 text-right font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {revisions.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="py-1.5 pr-3 text-text-secondary">
                  {FIELD_LABEL[r.field] ?? r.field}
                </td>
                <td className="py-1.5 pr-3 font-mono text-text">
                  {r.old_value ?? "—"}{" "}
                  <span className="text-text-tertiary">→</span>{" "}
                  {r.new_value ?? "—"}
                </td>
                <td className="py-1.5 pr-3 text-text-tertiary">
                  {r.reason ?? <span className="italic">no reason given</span>}
                </td>
                <td className="py-1.5 text-right font-mono whitespace-nowrap text-text-tertiary">
                  {formatDate(r.changed_at.slice(0, 10))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-text-tertiary">
        Pace for a past date is computed against the values in effect then, not
        the ones above.
      </p>
    </Panel>
  );
}
