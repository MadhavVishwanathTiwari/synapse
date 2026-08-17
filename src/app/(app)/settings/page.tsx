import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").single();

  if (!profile) {
    // handle_new_user() creates this row on sign-up, so its absence means the
    // trigger did not fire — worth surfacing rather than silently rendering blanks.
    return (
      <>
        <PageHeader title="Settings" />
        <div className="px-8 py-6">
          <p className="text-sm text-danger">
            No profile row found for this account. The on-signup trigger did not
            run — re-apply the Phase 0 migration with{" "}
            <code className="font-mono text-xs">npm run db:push</code>.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="These values parameterise every metric in the app."
        actions={
          <form action={signOut}>
            <Button type="submit" variant="secondary">
              Sign out
            </Button>
          </form>
        }
      />

      <div className="px-8 py-6">
        <p className="mb-6 text-sm text-text-secondary">
          Signed in as{" "}
          <span className="font-mono text-text">{user.email}</span>
        </p>

        <SettingsForm
          profile={profile}
          timezones={Intl.supportedValuesOf("timeZone")}
        />
      </div>
    </>
  );
}
