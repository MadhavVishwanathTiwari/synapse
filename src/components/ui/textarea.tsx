import * as React from "react";

import { cn } from "@/lib/utils";

/** The multi-line counterpart to Input, matching its fill, border and focus. */
export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-[72px] w-full rounded-sm border border-border bg-bg-input px-2 py-1.5 text-sm text-text",
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
