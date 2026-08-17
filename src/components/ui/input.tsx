import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Notion inputs sit on a translucent fill with an inset border rather than a
 * raised field, and only reveal the accent on focus.
 */
export function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-8 w-full rounded-sm border border-border bg-bg-input px-2 text-sm text-text",
        "placeholder:text-text-tertiary",
        "transition-colors outline-none",
        "focus-visible:border-accent focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
