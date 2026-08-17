import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The honest alternative to a placeholder.
 *
 * Hard rule 8: never fabricate a metric in the UI. Where there is no data yet,
 * say so plainly — a chart with plausible numbers in it is worse than nothing,
 * because it cannot be told apart from a real one.
 */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-4 py-8 text-center",
        className,
      )}
    >
      <p className="text-sm text-text-secondary">{title}</p>
      {description ? (
        <p className="max-w-[46ch] text-xs leading-relaxed text-text-tertiary">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
