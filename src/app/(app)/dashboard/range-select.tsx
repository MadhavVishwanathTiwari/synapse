"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

import { RANGE_LABEL, RANGES, type Range } from "./display";

/**
 * The one filter row, above everything it scopes.
 *
 * Per-chart range controls would let two panels on the same screen describe
 * different windows, which is the fastest way to make a dashboard untrustworthy.
 * Every figure on the page reads this one value.
 *
 * Links rather than a listbox: the page is server-rendered from the search
 * params, so navigation is the state change. Other params — the divergence
 * chart's goal selection — are preserved rather than dropped.
 */
export function RangeSelect({ value }: { value: Range }) {
  const pathname = usePathname();
  const params = useSearchParams();

  const hrefFor = (range: Range) => {
    const next = new URLSearchParams(params);
    next.set("range", String(range));
    return `${pathname}?${next.toString()}`;
  };

  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-border p-0.5"
      role="group"
      aria-label="Date range"
    >
      {RANGES.map((range) => {
        const active = range === value;
        return (
          <Link
            key={range}
            href={hrefFor(range)}
            aria-current={active ? "true" : undefined}
            className={cn(
              "rounded-sm px-2.5 py-1 text-xs transition-colors",
              active
                ? "bg-bg-active text-text"
                : "text-text-secondary hover:bg-bg-hover hover:text-text",
            )}
          >
            {RANGE_LABEL[range]}
          </Link>
        );
      })}
    </div>
  );
}
