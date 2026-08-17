"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Profile } from "@/lib/supabase/types";

import { updateSettings, type SettingsState } from "./actions";

const INITIAL: SettingsState = { error: null, saved: false };

function SaveButton({ saved }: { saved: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {saved && !pending ? (
        <span className="text-xs text-success">Saved</span>
      ) : null}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-start gap-4 py-3">
      <div className="pt-1.5">
        <Label>{label}</Label>
        {hint ? (
          <p className="mt-0.5 text-xs text-text-tertiary">{hint}</p>
        ) : null}
      </div>
      <div className="max-w-[280px]">{children}</div>
    </div>
  );
}

export function SettingsForm({
  profile,
  timezones,
}: {
  profile: Profile;
  timezones: string[];
}) {
  const [state, formAction] = useActionState(updateSettings, INITIAL);

  return (
    <form action={formAction} className="max-w-2xl">
      <div className="divide-y divide-border">
        <Field
          label="Timezone"
          hint="Slots are stored in UTC and projected onto your local day."
        >
          <select
            name="timezone"
            defaultValue={profile.timezone}
            className="h-8 w-full rounded-sm border border-border bg-bg-input px-2 text-sm text-text outline-none focus-visible:border-accent"
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz} className="bg-bg-elevated">
                {tz}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Waking window"
          hint="The denominator of the coverage metric. Time outside it is not expected to be logged."
        >
          <div className="flex items-center gap-2">
            <Input
              name="waking_start"
              type="time"
              defaultValue={profile.waking_start.slice(0, 5)}
              required
            />
            <span className="text-text-tertiary">–</span>
            <Input
              name="waking_end"
              type="time"
              defaultValue={profile.waking_end.slice(0, 5)}
              required
            />
          </div>
        </Field>

        <Field
          label="Quiet hours"
          hint="Telegram nudges are suppressed inside this window."
        >
          <div className="flex items-center gap-2">
            <Input
              name="quiet_hours_start"
              type="time"
              defaultValue={profile.quiet_hours_start.slice(0, 5)}
              required
            />
            <span className="text-text-tertiary">–</span>
            <Input
              name="quiet_hours_end"
              type="time"
              defaultValue={profile.quiet_hours_end.slice(0, 5)}
              required
            />
          </div>
        </Field>

        <Field
          label="EWMA half-life"
          hint="Days until a data point carries half its original weight. Lower reacts faster; higher is steadier."
        >
          <div className="flex items-center gap-2">
            <Input
              name="ewma_half_life_days"
              type="number"
              min={1}
              max={90}
              defaultValue={profile.ewma_half_life_days}
              required
            />
            <span className="text-sm text-text-tertiary">days</span>
          </div>
        </Field>
      </div>

      {state.error ? (
        <p role="alert" className="mt-4 text-xs text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="mt-5">
        <SaveButton saved={state.saved} />
      </div>
    </form>
  );
}
