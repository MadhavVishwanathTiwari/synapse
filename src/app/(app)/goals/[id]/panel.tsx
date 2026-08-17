import * as React from "react";

import { cn } from "@/lib/utils";

/** A titled section on the goal detail page. Local to this route by design. */
export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-md border border-border bg-bg-elevated p-4",
        className,
      )}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium tracking-wide text-text-secondary uppercase">
          {title}
        </h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

/** A large figure with a label. Values are mono so columns line up. */
export function Figure({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  tone?: string;
}) {
  return (
    <div>
      <p className="text-xs text-text-secondary">{label}</p>
      <p className={cn("mt-1 font-mono text-lg text-text", tone)}>
        {value}
        {suffix ? (
          <span className="ml-1 text-xs text-text-tertiary">{suffix}</span>
        ) : null}
      </p>
    </div>
  );
}
