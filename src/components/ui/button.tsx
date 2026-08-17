"use client";

import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Notion's buttons are compact (28–32px) with tight radii and no shadows.
 * Depth comes from translucent hover states over the surface beneath, which is
 * why every background here is an alpha value rather than an opaque grey.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-medium transition-colors select-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-text hover:bg-accent-hover disabled:hover:bg-accent",
        secondary:
          "border border-border bg-transparent text-text hover:bg-bg-hover",
        ghost: "bg-transparent text-text-secondary hover:bg-bg-hover hover:text-text",
        danger: "bg-transparent text-danger hover:bg-tag-red",
      },
      size: {
        sm: "h-7 px-2 text-xs [&_svg]:size-3.5",
        md: "h-8 px-2.5 text-sm [&_svg]:size-4",
        lg: "h-9 px-3.5 text-sm [&_svg]:size-4",
        icon: "size-7 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element instead of a <button>, for links styled as buttons. */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
