"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/ui/panel";
import type { GoalProgress } from "@/lib/supabase/types";

import { INITIAL, upsertProgress } from "../actions";
import { formatNumber, formatShortDate, today } from "../display";

/**
 * Daily progress entry and a bar of the last 30 days.
 *
 * The bars are drawn directly rather than with a chart library: the series is
 * one value per day with no axes worth the name, and Recharts would add a client
 * bundle for something a flexbox does better.
 */
export function ProgressPanel({
  goalId,
  unit,
  entries,
}: {
  goalId: string;
  unit: string | null;
  entries: GoalProgress[];
}) {
  const [state, formAction] = React.useActionState(upsertProgress, INITIAL);

  const recent = React.useMemo(
    () => [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-30),
    [entries],
  );

  const max = React.useMemo(
    () => Math.max(...recent.map((e) => Math.abs(Number(e.value))), 1),
    [recent],
  );

  const total = React.useMemo(
    () => entries.reduce((sum, e) => sum + Number(e.value), 0),
    [entries],
  );

  return (
    <Panel title="Progress">
      {recent.length === 0 ? (
        <EmptyState
          title="Nothing logged yet"
          description="Pace needs at least one entry before it can report a rate."
        />
      ) : (
        <>
          {/* Bars are capped: a goal with two entries should read as two marks
              on a sparse timeline, not as two enormous blocks filling the panel. */}
          <div className="flex h-24 items-end gap-0.5">
            {recent.map((entry) => {
              const value = Number(entry.value);
              const height = Math.max((Math.abs(value) / max) * 100, 2);
              return (
                <div
                  key={entry.date}
                  title={`${formatShortDate(entry.date)} — ${formatNumber(value)}${unit ? ` ${unit}` : ""}${entry.note ? `\n${entry.note}` : ""}`}
                  style={{ height: `${height}%` }}
                  className={`max-w-[14px] min-w-[3px] flex-1 rounded-t-[2px] ${
                    value < 0 ? "bg-danger/60" : "bg-accent/70"
                  } hover:bg-accent`}
                />
              );
            })}
          </div>
          <p className="mt-2 font-mono text-xs text-text-tertiary">
            {formatNumber(total)} {unit ?? ""} total across {entries.length} entr
            {entries.length === 1 ? "y" : "ies"}
          </p>
        </>
      )}

      <form
        action={formAction}
        className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4"
      >
        <input type="hidden" name="goal_id" value={goalId} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="progress-date">Date</Label>
          <Input
            id="progress-date"
            name="date"
            type="date"
            defaultValue={today()}
            className="w-[150px]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="progress-value">Amount</Label>
          <Input
            id="progress-value"
            name="value"
            type="number"
            step="any"
            required
            className="w-[110px] font-mono"
          />
        </div>

        <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
          <Label htmlFor="progress-note">Note</Label>
          <Input id="progress-note" name="note" maxLength={2000} />
        </div>

        <SubmitButton />
      </form>

      <p className="mt-2 text-xs text-text-tertiary">
        Enter what you did that day, not the running total. Re-entering a date
        replaces it.
      </p>

      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </Panel>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Log"}
    </Button>
  );
}
