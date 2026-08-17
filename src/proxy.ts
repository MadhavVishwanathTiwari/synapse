import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next 16 renamed the `middleware` convention to `proxy`. Same execution model:
 * runs before every matched request, and is the only place able to write the
 * refreshed Supabase auth cookie.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Every path except static assets and image files. Auth routes are
     * deliberately included — the session must be refreshed there too.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
