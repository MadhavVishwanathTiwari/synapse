"use client";

import { Link2, Plus } from "lucide-react";
import * as React from "react";
import { useFormStatus } from "react-dom";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Goal, GoalLinkType } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { createLink, INITIAL } from "../actions";
import { HORIZON_LABEL, LINK_TYPE_LABEL } from "../display";

type Candidate = Pick<Goal, "id" | "title" | "horizon" | "metric_unit">;

/** Allocated weight per goal id, from the goal_weight_budget view. */
export type Budgets = Record<string, number>;

const DIRECTIONS = [
  { value: "up", label: "This goal contributes to…" },
  { value: "down", label: "…contributes to this goal" },
];

const LINK_TYPES = (
  ["contributes_to", "depends_on", "relates_to"] as GoalLinkType[]
).map((t) => ({ value: t, label: LINK_TYPE_LABEL[t] }));

export function LinkEditor({
  goal,
  candidates,
  budgets,
}: {
  goal: Goal;
  candidates: Candidate[];
  budgets: Budgets;
}) {
  const [open, setOpen] = React.useState(false);
  const [direction, setDirection] = React.useState("up");
  const [linkType, setLinkType] = React.useState<GoalLinkType>("contributes_to");
  const [otherId, setOtherId] = React.useState("");
  const [weight, setWeight] = React.useState(1);

  // Closed here rather than from an effect: the dialog closes because the link
  // was created, not because a piece of state later happens to look successful.
  const [state, formAction] = React.useActionState(
    async (prev: typeof INITIAL, formData: FormData) => {
      const result = await createLink(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  const other = candidates.find((c) => c.id === otherId) ?? null;

  // The weight is always a share of the CHILD's effort, so which goal's budget
  // applies flips with the direction.
  const childId = direction === "up" ? goal.id : otherId;
  const childUnit = direction === "up" ? goal.metric_unit : (other?.metric_unit ?? null);
  const parentUnit = direction === "up" ? (other?.metric_unit ?? null) : goal.metric_unit;

  const allocated = childId ? (budgets[childId] ?? 0) : 0;
  const free = Math.max(0, 1 - allocated);
  const over = linkType === "contributes_to" && weight > free + 1e-9;

  const unitsDiffer =
    linkType === "contributes_to" &&
    childUnit !== null &&
    parentUnit !== null &&
    childUnit !== parentUnit;

  const options = React.useMemo(
    () => [
      { value: "", label: "Pick a goal…" },
      ...candidates.map((c) => ({
        value: c.id,
        label: `${HORIZON_LABEL[c.horizon]} · ${c.title}`,
      })),
    ],
    [candidates],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Plus className="size-3.5" />
          Link
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New link</DialogTitle>
          <DialogDescription>
            Weight is the share of the lower goal&rsquo;s effort attributed to the
            higher one. Splitting it is what stops a goal being counted twice.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <input
            type="hidden"
            name="parent_id"
            value={direction === "up" ? otherId : goal.id}
          />
          <input
            type="hidden"
            name="child_id"
            value={direction === "up" ? goal.id : otherId}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="direction">Direction</Label>
            <Select
              id="direction"
              options={DIRECTIONS}
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="other">Goal</Label>
            <Select
              id="other"
              options={options}
              value={otherId}
              onChange={(e) => setOtherId(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="link_type">Type</Label>
            <Select
              id="link_type"
              name="link_type"
              options={LINK_TYPES}
              value={linkType}
              onChange={(e) => setLinkType(e.target.value as GoalLinkType)}
            />
            {linkType === "depends_on" ? (
              <p className="text-xs text-text-tertiary">
                The upper goal is the prerequisite; the lower one is blocked until
                it is done.
              </p>
            ) : null}
          </div>

          {linkType === "contributes_to" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="contribution_weight">Weight</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={weight}
                    onChange={(e) => setWeight(Number(e.target.value))}
                    className="flex-1 accent-accent"
                  />
                  <Input
                    id="contribution_weight"
                    name="contribution_weight"
                    type="number"
                    min={0.01}
                    max={1}
                    step={0.01}
                    value={weight}
                    onChange={(e) => setWeight(Number(e.target.value))}
                    className="w-[80px] font-mono"
                  />
                </div>
                <BudgetMeter allocated={allocated} pending={weight} over={over} />
              </div>

              {unitsDiffer ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="conversion_factor">
                      Conversion — {childUnit} to {parentUnit}
                    </Label>
                    <Input
                      id="conversion_factor"
                      name="conversion_factor"
                      type="number"
                      step="any"
                      min={0}
                      placeholder="0.05"
                      className="font-mono"
                    />
                    <p className="text-xs text-text-tertiary">
                      Optional. Left blank, effort still rolls up across this link
                      but the outcome rollup will refuse to cross it and will say
                      so — which is the honest result, not a failure.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="conversion_note">Conversion note</Label>
                    <Textarea
                      id="conversion_note"
                      name="conversion_note"
                      maxLength={2000}
                      placeholder="observed 5% reply rate"
                    />
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <input type="hidden" name="contribution_weight" value="1" />
          )}

          {state.error ? (
            <p role="alert" className="text-xs text-danger">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton disabled={!otherId || over} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Shows the child's 1.0 budget as it will stand if this link is saved.
 *
 * A courtesy, not the authority: the SY002 trigger still runs, and a concurrent
 * edit in another tab can still lose the race. But an over-allocation ought to
 * be visible before submitting rather than arriving as a database error.
 */
function BudgetMeter({
  allocated,
  pending,
  over,
}: {
  allocated: number;
  pending: number;
  over: boolean;
}) {
  const free = Math.max(0, 1 - allocated);
  const usedPct = Math.min(allocated, 1) * 100;
  const pendingPct = Math.min(Math.max(pending, 0), 1) * 100;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full border border-border">
        <div style={{ width: `${usedPct}%` }} className="bg-text-tertiary" />
        <div
          style={{ width: `${Math.min(pendingPct, 100 - usedPct)}%` }}
          className={cn(over ? "bg-danger" : "bg-accent")}
        />
      </div>
      {over ? (
        <p role="alert" className="text-xs text-danger">
          Over-allocated by {(pending - free).toFixed(2)}. Reduce this weight, or
          lower another parent&rsquo;s share first.
        </p>
      ) : (
        <p className="font-mono text-xs text-text-tertiary">
          {free.toFixed(2)} of 1.00 free · this link uses {pending.toFixed(2)} ·{" "}
          {(free - pending).toFixed(2)} left
        </p>
      )}
    </div>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={disabled || pending}>
      <Link2 className="size-3.5" />
      {pending ? "Linking…" : "Create link"}
    </Button>
  );
}
