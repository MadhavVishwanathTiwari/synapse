import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import type { GoalOverview } from "@/lib/supabase/types";

import { HorizonBoard } from "./horizon-board";
import { NewGoalDialog } from "./new-goal-dialog";

export const metadata: Metadata = { title: "Goals" };

export default async function GoalsPage() {
  const supabase = await createClient();

  // Reads through RLS with the user's own session, so this returns their rows
  // and nothing else even though the query has no explicit user filter.
  const { data, error } = await supabase
    .from("goal_overview")
    .select("*")
    .order("due_date", { ascending: true })
    .order("title", { ascending: true });

  // The view's columns arrive typed as nullable because Postgres does not record
  // NOT NULL on views. See GoalOverview in lib/supabase/types.
  const rows = (data ?? []) as GoalOverview[];

  // Surfacing this matters: an empty board and a failed query look identical,
  // and a silent zero is exactly the confusion this project exists to remove.
  if (error) {
    return (
      <>
        <PageHeader title="Goals" />
        <div className="px-8 py-6">
          <p role="alert" className="text-sm text-danger">
            Could not load goals: {error.message}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Goals"
        description="Six horizons, linked as a graph. Effort rolls up the whole chain; outcomes only where the units reconcile."
        actions={<NewGoalDialog />}
      />

      <div className="px-8 py-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No goals yet"
            description="Start with something long-range — a decade or year goal — then hang the shorter horizons off it. The ancestry view needs a chain to draw."
            action={<NewGoalDialog horizon="year" />}
          />
        ) : (
          <HorizonBoard goals={rows} />
        )}
      </div>
    </>
  );
}
