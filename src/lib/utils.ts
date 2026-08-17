import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes so later classes win conflicts.
 * Every component that accepts a `className` prop composes it through this.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
