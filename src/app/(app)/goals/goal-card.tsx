import Link from "next/link";

import { Badge, TAG_TEXT } from "@/components/ui/badge";
import type { GoalOverview } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { formatNumber, formatShortDate, STATUS_LABEL } from "./display";

/**
 * One goal on the board.
 *
 * Shows a target only where one exists. A goal with no unit shows nothing in
 * that slot rather than a zero — an unmeasured goal and a goal measured at zero
 * are different things.
 */
export function GoalCard({ goal }: { goal: GoalOverview }) {
  const measured = goal.metric_unit !== null && goal.target_value !== null;

  return (
    <Link
      href={`/goals/${goal.id}`}
      className={cn(
        "group flex flex-col gap-1.5 rounded-md border border-border bg-bg-elevated p-2.5",
        "transition-colors hover:border-border-strong hover:bg-bg-hover",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className={cn("mt-1 text-[8px] leading-none", TAG_TEXT[goal.color])}
        >
          ●
        </span>
        <span
          className={cn(
            "line-clamp-2 flex-1 text-sm leading-snug text-text",
            goal.status === "done" && "text-text-secondary line-through",
            goal.status === "abandoned" && "text-text-tertiary line-through",
          )}
        >
          {goal.title}
        </span>
        {goal.is_blocked ? (
          <span
            title="Blocked by an unfinished prerequisite"
            className="mt-0.5 text-[8px] leading-none text-warning"
          >
            ●
          </span>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 pl-4 text-xs text-text-tertiary">
        {measured ? (
          <span className="font-mono">
            {formatNumber(goal.progress_total)} / {formatNumber(goal.target_value)}{" "}
            <span className="text-text-tertiary">{goal.metric_unit}</span>
          </span>
        ) : (
          <span>{goal.status === "active" ? "No target" : STATUS_LABEL[goal.status]}</span>
        )}
        <span className="font-mono">{formatShortDate(goal.due_date)}</span>
      </div>

      {goal.parent_count > 0 || goal.child_count > 0 ? (
        <div className="flex gap-1 pl-4">
          {goal.child_count > 0 ? (
            <Badge color="gray" className="font-mono text-[10px]">
              {goal.child_count} feeding in
            </Badge>
          ) : null}
          {goal.parent_count > 0 ? (
            <Badge color="gray" className="font-mono text-[10px]">
              {goal.parent_count} up
            </Badge>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}
