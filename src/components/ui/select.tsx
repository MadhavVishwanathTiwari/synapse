import * as React from "react";

import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

/**
 * A styled native `<select>`, deliberately not a Radix listbox.
 *
 * It participates in FormData for free, needs no client boundary on the form
 * that uses it, and works before hydration. Every goals form posts through a
 * Server Action, so those three properties are worth more than the nicer popup.
 */
export function Select({
  className,
  options,
  ...props
}: React.ComponentProps<"select"> & { options: readonly SelectOption[] }) {
  return (
    <select
      className={cn(
        "flex h-8 w-full appearance-none rounded-sm border border-border bg-bg-input px-2 text-sm text-text",
        "transition-colors outline-none",
        "focus-visible:border-accent focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-bg-elevated">
          {option.label}
        </option>
      ))}
    </select>
  );
}
