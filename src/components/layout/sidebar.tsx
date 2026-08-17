"use client";

import {
  CalendarDays,
  Dumbbell,
  LayoutDashboard,
  ListChecks,
  Settings,
  Target,
  Wallet,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Phase that delivers this route. Unbuilt routes render inert. */
  phase: number;
};

/*
 * The full information architecture is listed from day one, with unbuilt
 * sections shown muted. Seeing the whole shape makes the roadmap legible, and
 * an inert row is more honest than a link that 404s.
 */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, phase: 3 },
  { href: "/goals", label: "Goals", icon: Target, phase: 1 },
  { href: "/today", label: "Today", icon: ListChecks, phase: 2 },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, phase: 4 },
  { href: "/finance", label: "Finance", icon: Wallet, phase: 6 },
  { href: "/gym", label: "Gym", icon: Dumbbell, phase: 7 },
  { href: "/settings", label: "Settings", icon: Settings, phase: 0 },
];

/** Routes that actually exist today. Update as each phase lands. */
const BUILT = new Set(["/dashboard", "/goals", "/today", "/settings"]);

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-border bg-bg-sidebar">
      <div className="px-4 pt-5 pb-4">
        {/*
         * The wordmark is white-on-opaque-black. `screen` blending makes the
         * black backdrop drop out over any dark surface, so no transparent
         * variant of the asset is needed.
         */}
        <Image
          src="/synapse-logo.png"
          alt="Synapse"
          width={1000}
          height={186}
          priority
          className="h-4 w-auto mix-blend-screen"
        />
      </div>

      <nav className="flex flex-1 flex-col gap-px px-2">
        {NAV.map(({ href, label, icon: Icon, phase }) => {
          const built = BUILT.has(href);
          const active = pathname === href || pathname.startsWith(`${href}/`);

          if (!built) {
            return (
              <span
                key={href}
                aria-disabled
                title={`Arrives in Phase ${phase}`}
                className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text-tertiary"
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1">{label}</span>
                <span className="rounded-sm bg-bg-hover px-1 py-px font-mono text-[10px] text-text-tertiary">
                  P{phase}
                </span>
              </span>
            );
          }

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors",
                active
                  ? "bg-bg-active text-text"
                  : "text-text-secondary hover:bg-bg-hover hover:text-text",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
