import { redirect } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { getUser } from "@/lib/supabase/server";

/**
 * Shell for every authenticated route.
 *
 * Middleware already redirects unauthenticated requests, but this check is kept
 * as well: middleware can be bypassed by config mistakes, and authorisation
 * should not depend on a single matcher regex being correct.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
