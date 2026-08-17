import * as React from "react";

import type { NotionColor } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

/*
 * Written out rather than interpolated. Tailwind v4 scans source text for class
 * names, so `bg-tag-${color}` would generate nothing and every badge would come
 * out unstyled.
 */
const TAG: Record<NotionColor, string> = {
  gray: "bg-tag-gray text-tag-gray-text",
  brown: "bg-tag-brown text-tag-brown-text",
  orange: "bg-tag-orange text-tag-orange-text",
  yellow: "bg-tag-yellow text-tag-yellow-text",
  green: "bg-tag-green text-tag-green-text",
  blue: "bg-tag-blue text-tag-blue-text",
  purple: "bg-tag-purple text-tag-purple-text",
  pink: "bg-tag-pink text-tag-pink-text",
  red: "bg-tag-red text-tag-red-text",
};

/** The fill alone, for a cell that carries no text — the week grid's slots. */
export const TAG_BG: Record<NotionColor, string> = {
  gray: "bg-tag-gray",
  brown: "bg-tag-brown",
  orange: "bg-tag-orange",
  yellow: "bg-tag-yellow",
  green: "bg-tag-green",
  blue: "bg-tag-blue",
  purple: "bg-tag-purple",
  pink: "bg-tag-pink",
  red: "bg-tag-red",
};

/** The same nine hues as a foreground-only rule, for dots and left borders. */
export const TAG_TEXT: Record<NotionColor, string> = {
  gray: "text-tag-gray-text",
  brown: "text-tag-brown-text",
  orange: "text-tag-orange-text",
  yellow: "text-tag-yellow-text",
  green: "text-tag-green-text",
  blue: "text-tag-blue-text",
  purple: "text-tag-purple-text",
  pink: "text-tag-pink-text",
  red: "text-tag-red-text",
};

export function Badge({
  color = "gray",
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { color?: NotionColor }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 text-xs leading-4 whitespace-nowrap",
        TAG[color],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
