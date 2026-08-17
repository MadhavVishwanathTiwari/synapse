"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  /*
   * Created inside a state initialiser rather than at module scope. A module-level
   * client would be shared across all users on the server and leak one user's
   * cached data into another's render.
   */
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The time grid is edited optimistically and re-fetching on every
            // window focus would fight the user's in-flight edits.
            refetchOnWindowFocus: false,
            staleTime: 30_000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {/* Radix requires exactly one provider above every Tooltip in the tree. */}
      <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
