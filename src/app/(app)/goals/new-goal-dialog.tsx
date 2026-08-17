"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { GOAL_HORIZONS, type GoalHorizon } from "@/lib/supabase/types";

import { createGoal, INITIAL_CREATE } from "./actions";
import { HORIZON_LABEL, horizonDefaultDue, today } from "./display";

const HORIZON_OPTIONS = GOAL_HORIZONS.map((h) => ({
  value: h,
  label: HORIZON_LABEL[h],
}));

const COLOR_OPTIONS = [
  "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red",
].map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }));

export function NewGoalDialog({
  horizon: initialHorizon = "day",
  trigger,
}: {
  horizon?: GoalHorizon;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [horizon, setHorizon] = React.useState<GoalHorizon>(initialHorizon);
  /*
   * Closing and navigating happen here rather than in an effect watching the
   * result. The dialog closes *because* the submission succeeded, and saying so
   * directly avoids a render pass where a stale success would close it again.
   */
  const [state, formAction] = React.useActionState(
    async (prev: typeof INITIAL_CREATE, formData: FormData) => {
      const result = await createGoal(prev, formData);
      if (result.ok && result.goalId) {
        setOpen(false);
        router.push(`/goals/${result.goalId}`);
      }
      return result;
    },
    INITIAL_CREATE,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reset to the column's horizon each time it opens, so the + on the
        // Quarter column always starts on Quarter.
        if (next) setHorizon(initialHorizon);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="primary">
            <Plus className="size-3.5" />
            New goal
          </Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>New goal</DialogTitle>
          <DialogDescription>
            A task is just a goal at the day horizon. Link it upward once it exists.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required maxLength={200} autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="horizon">Horizon</Label>
              <Select
                id="horizon"
                name="horizon"
                options={HORIZON_OPTIONS}
                value={horizon}
                onChange={(e) => setHorizon(e.target.value as GoalHorizon)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="color">Colour</Label>
              <Select
                id="color"
                name="color"
                options={COLOR_OPTIONS}
                defaultValue="gray"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="start_date">Starts</Label>
              <Input id="start_date" name="start_date" type="date" defaultValue={today()} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="due_date">Due</Label>
              {/* Keyed so changing the horizon re-defaults the date rather than
                  leaving a stale one from the previous selection. */}
              <Input
                key={horizon}
                id="due_date"
                name="due_date"
                type="date"
                defaultValue={horizonDefaultDue(horizon)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="metric_unit">Unit</Label>
              <Input
                id="metric_unit"
                name="metric_unit"
                maxLength={40}
                placeholder="emails, clients, INR"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="target_value">Target</Label>
              <Input
                id="target_value"
                name="target_value"
                type="number"
                step="any"
                className="font-mono"
              />
            </div>
          </div>
          <p className="-mt-1 text-xs text-text-tertiary">
            Leave both blank for a goal that is not counted. A target without a
            unit is unmeasurable, and a unit without a target is noise, so the
            two travel together.
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" maxLength={2000} />
          </div>

          {state.error ? (
            <p role="alert" className="text-xs text-danger">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? "Creating…" : "Create goal"}
    </Button>
  );
}
