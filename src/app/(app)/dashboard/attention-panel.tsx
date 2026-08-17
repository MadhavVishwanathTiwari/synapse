import { Ban, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/ui/panel";
import type { AttentionRow } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { HORIZON_LABEL, PACE_SENTENCE, PACE_TONE } from "../goals/display";
import { formatValue, NO_DATA } from "./display";

/**
 * The goals where something is true.
 *
 * Not a list of every goal. On_track, ahead, complete, unmeasured and no_data
 * are all either fine or unknowable, and a list that includes them is a list of
 * everything — which nobody reads, which makes it worse than no list at all.
 *
 * The wording of each verdict comes from PACE_SENTENCE, which Phase 1 wrote
 * precisely so the phrasing of an undefined metric is decided once. Several of
 * these states exist so the UI can avoid printing a ratio that would be
 * meaningless, and the sentence has to carry the meaning on its own.
 */
export function AttentionPanel({ rows }: { rows: AttentionRow[] }) {
  return (
    <Panel title="Needs attention">
      {rows.length === 0 ? (
        <EmptyState
          title={NO_DATA.attention}
          description="This panel only lists goals with something wrong. Empty is the good state."
        />
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li
              key={row.goal_id}
              className="border-b border-border py-2.5 first:pt-0 last:border-b-0 last:pb-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={`/goals/${row.goal_id}`}
                  className="truncate text-sm text-text hover:underline"
                >
                  {row.title}
                </Link>
                <span className="shrink-0 text-xs text-text-tertiary">
                  {HORIZON_LABEL[row.horizon]}
                </span>
              </div>

              <p className={cn("mt-0.5 text-xs", PACE_TONE[row.status])}>
                {PACE_SENTENCE[row.status]}
              </p>

              {/*
               * Each rate appears only where goal_pace actually computed it,
               * INDEPENDENTLY of the others. An overdue goal has an achieved
               * rate and no required one — there are no days left to spread the
               * remainder over — and printing "—/day needed" beside the real
               * figure is a dash with no explanation, which is the failure this
               * phase is most likely to ship. The sentence above already says
               * why the number is missing; the row just leaves it out.
               */}
              <Rates
                required={row.required_rate}
                achieved={row.achieved_rate}
                ratio={row.pace_ratio}
              />

              {row.is_blocked && row.blocker_titles ? (
                <p className="mt-1 flex items-start gap-1.5 text-xs text-warning">
                  <Ban className="mt-px size-3 shrink-0" />
                  <span>
                    Waiting on {row.blocker_titles.join(", ")} — unfinished
                    prerequisite
                    {row.blocker_titles.length === 1 ? "" : "s"}.
                  </span>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * The rates behind a verdict, printing only the ones that exist.
 *
 * `goal_pace` leaves each of these null under different conditions: the required
 * rate needs days remaining, the achieved rate needs at least one progress
 * entry, and the ratio needs both. They are not null together, so they cannot be
 * shown or hidden together either.
 */
function Rates({
  required,
  achieved,
  ratio,
}: {
  required: number | null;
  achieved: number | null;
  ratio: number | null;
}) {
  const parts: string[] = [];
  if (required !== null) parts.push(`${formatValue(required)}/day needed`);
  if (achieved !== null) parts.push(`${formatValue(achieved)}/day achieved`);
  if (ratio !== null) parts.push(`${formatValue(ratio)}× off pace`);

  if (parts.length === 0) return null;

  return (
    <p className="mt-1 font-mono text-xs text-text-tertiary">
      {parts.join(" · ")}
    </p>
  );
}

/** A count for the page header, so the panel is findable without scrolling. */
export function AttentionBadge({ rows }: { rows: AttentionRow[] }) {
  if (rows.length === 0) return null;
  return (
    <span className="flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-xs text-warning">
      <TriangleAlert className="size-3.5" />
      {rows.length} needing attention
    </span>
  );
}
