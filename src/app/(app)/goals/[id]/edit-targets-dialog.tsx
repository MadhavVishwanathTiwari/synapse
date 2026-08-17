"use client";

import { Pencil } from "lucide-react";
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
import type { Goal } from "@/lib/supabase/types";

import { INITIAL, updateGoalTargets } from "../actions";
import { STATUS_LABEL } from "../display";

const STATUS_OPTIONS = (
  ["active", "done", "abandoned", "blocked"] as const
).map((s) => ({ value: s, label: STATUS_LABEL[s] }));

/**
 * The revision prompt.
 *
 * These are the only three fields that write goal_revisions, which is why they
 * are edited here rather than inline with the title and colour: moving a target
 * or a deadline is an event worth explaining, and the copy says plainly that the
 * old value keeps applying to the past.
 */
export function EditTargetsDialog({ goal }: { goal: Goal }) {
  const [open, setOpen] = React.useState(false);
  // Closed here rather than from an effect: the dialog closes because the
  // revision was recorded, not because state later looks successful.
  const [state, formAction] = React.useActionState(
    async (prev: typeof INITIAL, formData: FormData) => {
      const result = await updateGoalTargets(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    INITIAL,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Pencil className="size-3.5" />
          Edit targets
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit targets</DialogTitle>
          <DialogDescription>
            Recorded permanently. Pace for past dates keeps using the old values.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="goal_id" value={goal.id} />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="metric_unit">Unit</Label>
              <Input
                id="metric_unit"
                name="metric_unit"
                maxLength={40}
                defaultValue={goal.metric_unit ?? ""}
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
                defaultValue={goal.target_value ?? ""}
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="due_date">Due</Label>
              <Input
                id="due_date"
                name="due_date"
                type="date"
                defaultValue={goal.due_date}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                name="status"
                options={STATUS_OPTIONS}
                defaultValue={goal.status}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Reason (optional)</Label>
            <Textarea
              id="reason"
              name="reason"
              maxLength={2000}
              placeholder="Why is this moving?"
            />
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
      {pending ? "Saving…" : "Save and record"}
    </Button>
  );
}
