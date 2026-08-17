import { redirect } from "next/navigation";

/**
 * There is no marketing surface — this is a single-user app, so the root is
 * just a redirect. Middleware sends unauthenticated requests to /login.
 */
export default function Home() {
  redirect("/dashboard");
}
