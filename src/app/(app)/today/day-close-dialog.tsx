"use client";

import { CopyCheck, MoonStar } from "lucide-react";
import * as React from "react";

import { TAG_TEXT } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type {
  DayCoverage,
  DayFidelity,
  DayGridRow,
  NotionColor,
} from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import type { CategoryOption, GoalOption } from "./day-grid";
import { clockLabel, formatRatio } from "./display";

/**
 * The evening ritual: plan beside actual, fill the gaps, and the day's two
 * adherence numbers once at the end.
 *
 * Deliberately not shown live on the grid. A coverage figure updating as you
 * paint is a nag, and a nag gets dismissed; a number you meet once, when the day
 * is done and can still be corrected, is one you read.
 */
export function DayCloseDialog({
  rows,
  coverage,
  fidelity,
  categories,
  goals,
  error,
  onFillFromPlan,
}: {
  rows: DayGridRow[];
  coverage: DayCoverage | null;
  fidelity: DayFidelity | null;
  categories: CategoryOption[];
  goals: GoalOption[];
  /*
   * The grid owns this, but the fill button lives in here and a modal covers the
   * grid completely. Without it a failed write reports itself to a surface
   * nobody can see, and the optimistic row stays on screen looking like data —
   * which is worse than the failure it is hiding.
   */
  error: string | null;
  onFillFromPlan: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  const categoryById = React.useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );
  const goalById = React.useMemo(
    () => new Map(goals.map((g) => [g.id, g])),
    [goals],
  );

  /*
   * These two counts are not metrics — they describe what the fill button will
   * write. Coverage and fidelity below come from SQL and are never recomputed
   * here; see hard rule 1 in AGENTS.md.
   */
  const gaps = rows.filter((row) => row.has_planned && !row.has_actual);
  const divergences = rows.filter(
    (row) =>
      row.has_planned &&
      row.has_actual &&
      (row.planned_goal_id !== row.actual_goal_id ||
        row.planned_category_id !== row.actual_category_id),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <MoonStar className="size-3.5" />
          Close the day
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Close the day</DialogTitle>
          <DialogDescription>
            Reconcile what you meant to do against what you did. Both are kept —
            the gap between them is the only measure of how well you predict
            yourself.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric
              label="Coverage"
              value={formatRatio(coverage?.coverage ?? null)}
              detail={
                coverage
                  ? `${coverage.logged} of ${coverage.expected} slots in your waking window`
                  : "No waking window to measure against."
              }
              sentence="How much of the day is accounted for."
            />
            <Metric
              label="Fidelity"
              value={formatRatio(fidelity?.fidelity ?? null)}
              detail={
                fidelity && fidelity.planned > 0
                  ? `${fidelity.honoured} of ${fidelity.planned} planned slots honoured`
                  : "Nothing was planned for this day."
              }
              sentence={
                fidelity && fidelity.planned > 0
                  ? "How much of the plan you followed."
                  : "A day with no plan has a fidelity of nothing — not 0%, and not 100%."
              }
              muted={!fidelity || fidelity.planned === 0}
            />
          </div>

          {gaps.length > 0 ? (
            <div className="rounded-md border border-border p-3">
              <p className="text-sm text-text">
                {gaps.length} planned {gaps.length === 1 ? "slot has" : "slots have"}{" "}
                nothing logged against {gaps.length === 1 ? "it" : "them"}.
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                Copying the plan across assumes the day went as intended. Slots
                that already record something are never overwritten.
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => onFillFromPlan()}
              >
                <CopyCheck className="size-3.5" />
                Copy the plan into {gaps.length}{" "}
                {gaps.length === 1 ? "slot" : "slots"}
              </Button>
            </div>
          ) : null}

          {divergences.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-text-secondary">
                {divergences.length} {divergences.length === 1 ? "slot" : "slots"}{" "}
                went differently to plan
              </p>
              <ul className="max-h-48 overflow-y-auto rounded-md border border-border">
                {divergences.map((row) => (
                  <li
                    key={row.slot_start}
                    className="grid grid-cols-[52px_1fr_1fr] items-center gap-2 border-b border-border px-2 py-1 text-xs last:border-b-0"
                  >
                    <span className="font-mono text-text-tertiary">
                      {clockLabel(row.local_time)}
                    </span>
                    <Assignment
                      categoryId={row.planned_category_id}
                      goalId={row.planned_goal_id}
                      categoryById={categoryById}
                      goalById={goalById}
                    />
                    <Assignment
                      categoryId={row.actual_category_id}
                      goalId={row.actual_goal_id}
                      categoryById={categoryById}
                      goalById={goalById}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-xs text-danger">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({
  label,
  value,
  detail,
  sentence,
  muted = false,
}: {
  label: string;
  value: string;
  detail: string;
  sentence: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-text-secondary">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-2xl",
          muted ? "text-text-tertiary" : "text-text",
        )}
      >
        {value}
      </p>
      <p className="mt-1 font-mono text-xs text-text-tertiary">{detail}</p>
      <p className="mt-1 text-xs text-text-secondary">{sentence}</p>
    </div>
  );
}

function Assignment({
  categoryId,
  goalId,
  categoryById,
  goalById,
}: {
  categoryId: string | null;
  goalId: string | null;
  categoryById: Map<string, CategoryOption>;
  goalById: Map<string, GoalOption>;
}) {
  const category = categoryId ? categoryById.get(categoryId) : null;
  const goal = goalId ? goalById.get(goalId) : null;

  if (!category && !goal) {
    return <span className="truncate text-text-tertiary">Unclassified</span>;
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        className={cn(
          "text-[8px] leading-none",
          category ? TAG_TEXT[category.color as NotionColor] : "text-text-tertiary",
        )}
      >
        ●
      </span>
      <span className="truncate text-text">{category?.name ?? "—"}</span>
      {goal ? (
        <span className="truncate text-text-secondary">· {goal.title}</span>
      ) : null}
    </span>
  );
}
