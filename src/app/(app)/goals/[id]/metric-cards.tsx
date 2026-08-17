import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import type {
  Goal,
  OutcomeRow,
  PaceRow,
  PaceStatus,
  UnsummedSubtree,
} from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import {
  formatNumber,
  PACE_SENTENCE,
  PACE_TONE,
  UNSUMMED_SENTENCE,
} from "../display";
import { Figure, Panel } from "./panel";

/*
 * The three rollup cards.
 *
 * Every one of these has a state in which it must print words instead of a
 * number. That is the point of hard rule 8: a figure the system cannot justify
 * is worse than an empty space, because nothing distinguishes it from one it can.
 */

export function PaceCard({ pace }: { pace: PaceRow | null }) {
  if (!pace) {
    return (
      <Panel title="Pace">
        <p className="text-sm text-text-tertiary">
          Pace could not be computed for this goal.
        </p>
      </Panel>
    );
  }

  const status = pace.status as PaceStatus;
  const showRates = pace.required_rate !== null || pace.achieved_rate !== null;

  return (
    <Panel title="Pace">
      <p className={cn("text-sm", PACE_TONE[status])}>{PACE_SENTENCE[status]}</p>

      {showRates ? (
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Figure
            label="Required"
            value={formatNumber(pace.required_rate)}
            suffix="/day"
          />
          <Figure
            label="Achieved"
            value={formatNumber(pace.achieved_rate)}
            suffix="/day"
          />
          {/*
           * The ratio never appears on its own. Without the word beside it a
           * reader has to remember which direction is good, and half of them
           * will remember wrong.
           */}
          <Figure
            label="Pace"
            value={pace.pace_ratio === null ? "—" : `${formatNumber(pace.pace_ratio)}×`}
            tone={PACE_TONE[status]}
          />
        </div>
      ) : null}

      {pace.remaining !== null ? (
        <p className="mt-3 text-xs text-text-tertiary">
          <span className="font-mono">{formatNumber(pace.remaining)}</span> still
          to go, <span className="font-mono">{pace.days_remaining}</span> day
          {pace.days_remaining === 1 ? "" : "s"} left.
        </p>
      ) : null}
    </Panel>
  );
}

export function OutcomeCard({
  goal,
  outcome,
  measured,
}: {
  goal: Goal;
  outcome: OutcomeRow | null;
  /** The goal's own entered progress, summed. Never added to the derived figure. */
  measured: number;
}) {
  const unsummed = (outcome?.unsummed ?? []) as unknown as UnsummedSubtree[];

  if (!goal.metric_unit) {
    return (
      <Panel title="Outcome">
        <p className="text-sm text-text-tertiary">
          This goal has no unit, so there is nothing to roll up. Give it a unit
          and a target to measure it.
        </p>
      </Panel>
    );
  }

  return (
    <Panel title="Outcome">
      {/*
       * Two independent series, never added together. Their divergence is the
       * signal — see docs/DECISIONS.md 004.
       */}
      <div className="grid grid-cols-2 gap-3">
        <Figure
          label="Measured"
          value={formatNumber(measured)}
          suffix={goal.metric_unit}
        />
        {/*
         * A derived figure of 0 with every subtree refused is not a measurement
         * of zero — it is the absence of one. Showing a dash there keeps the two
         * apart; "partial" covers the case where some of it did sum.
         */}
        <Figure
          label={
            unsummed.length > 0 ? "Derived from children (partial)" : "Derived from children"
          }
          value={
            unsummed.length > 0 && Number(outcome?.value ?? 0) === 0
              ? "—"
              : formatNumber(outcome?.value ?? null)
          }
          suffix={goal.metric_unit}
          tone={unsummed.length > 0 ? "text-text-secondary" : undefined}
        />
      </div>
      <p className="mt-2 text-xs text-text-tertiary">
        Entered progress and the figure implied by the goals below are shown
        separately on purpose. They are not added.
      </p>

      {unsummed.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-xs text-warning">
            <TriangleAlert className="size-3.5" />
            {unsummed.length} subtree{unsummed.length === 1 ? "" : "s"} not summed
          </p>
          {unsummed.map((item) => (
            <div key={`${item.goal_id}-${item.reason}`} className="text-xs">
              <Link
                href={`/goals/${item.goal_id}`}
                className="text-text hover:underline"
              >
                {item.title}
              </Link>
              <p className="text-text-tertiary">
                {UNSUMMED_SENTENCE[item.reason] ?? item.reason}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

export function EffortCard({ hours }: { hours: number | null }) {
  const total = hours ?? 0;

  return (
    <Panel title="Effort">
      <Figure label="Rolled up" value={formatNumber(total, 2)} suffix="h" />
      {/*
       * A bare 0.0 h is ambiguous in a way the other cards are not: it reads
       * identically whether nothing has been logged against this subtree or the
       * ledger is empty everywhere. Naming which one it is costs a sentence.
       */}
      <p className="mt-2 text-xs text-text-tertiary">
        {total === 0 ? (
          <>
            Nothing logged against this goal or anything beneath it. Paint slots
            on <Link href="/today" className="text-text hover:underline">Today</Link>{" "}
            and they roll up here.
          </>
        ) : (
          <>
            Actual slots only, weighted by each descendant&rsquo;s contribution
            share — so a goal feeding two parents is split between them rather
            than counted twice.
          </>
        )}
      </p>
    </Panel>
  );
}
