"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[180px] rounded-md border border-border bg-bg-elevated p-1",
          "shadow-[0_8px_24px_rgba(0,0,0,0.5)]",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/** Menu row inside a popover. Matches Notion's dropdown item metrics. */
export function PopoverItem({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
        "text-text transition-colors hover:bg-bg-hover",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
