import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge, TAG_TEXT } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import type {
  Goal,
  GoalWeightBudget,
  OutcomeRow,
  PaceRow,
} from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { formatDate, HORIZON_LABEL, STATUS_LABEL, today } from "../display";
import { EditTargetsDialog } from "./edit-targets-dialog";
import { type Budgets } from "./link-editor";
import { LinksPanel, type LinkRow } from "./links-panel";
import { EffortCard, OutcomeCard, PaceCard } from "./metric-cards";
import { ProgressPanel } from "./progress-panel";
import { RevisionHistory } from "./revision-history";

export const metadata: Metadata = { title: "Goal" };

const OTHER = "id, title, horizon, metric_unit, status";

export default async function GoalPage({ params }: PageProps<"/goals/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const asOf = today();

  const { data: goal } = await supabase
    .from("goals")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  // Under RLS a goal belonging to someone else simply is not there, which is
  // the correct response to ask for it.
  if (!goal) notFound();

  const [
    outgoingRes,
    incomingRes,
    progressRes,
    revisionsRes,
    paceRes,
    outcomeRes,
    effortRes,
    candidatesRes,
    budgetRes,
  ] = await Promise.all([
    supabase
      .from("goal_links")
      .select(`parent_id, child_id, link_type, contribution_weight,
               conversion_factor, conversion_note, other:goals!goal_links_parent_fkey(${OTHER})`)
      .eq("child_id", id),
    supabase
      .from("goal_links")
      .select(`parent_id, child_id, link_type, contribution_weight,
               conversion_factor, conversion_note, other:goals!goal_links_child_fkey(${OTHER})`)
      .eq("parent_id", id),
    supabase
      .from("goal_progress")
      .select("*")
      .eq("goal_id", id)
      .order("date", { ascending: false })
      .limit(120),
    supabase
      .from("goal_revisions")
      .select("*")
      .eq("goal_id", id)
      .order("changed_at", { ascending: false }),
    supabase.rpc("goal_pace", { p_goal_id: id, p_as_of: asOf }),
    supabase.rpc("goal_outcome_rollup", { p_goal_id: id }),
    supabase.rpc("goal_effort_rollup", { p_goal_id: id }),
    supabase.from("goals").select(OTHER).neq("id", id).order("horizon"),
    supabase.from("goal_weight_budget").select("*"),
  ]);

  const g = goal as Goal;
  const outgoing = (outgoingRes.data ?? []) as unknown as LinkRow[];
  const incoming = (incomingRes.data ?? []) as unknown as LinkRow[];
  const progress = progressRes.data ?? [];
  const revisions = revisionsRes.data ?? [];
  const pace = (paceRes.data?.[0] ?? null) as PaceRow | null;
  const outcome = (outcomeRes.data?.[0] ?? null) as OutcomeRow | null;
  const effort = typeof effortRes.data === "number" ? effortRes.data : null;
  const candidates = (candidatesRes.data ?? []) as Pick<
    Goal,
    "id" | "title" | "horizon" | "metric_unit"
  >[];

  const budgets: Budgets = Object.fromEntries(
    ((budgetRes.data ?? []) as unknown as GoalWeightBudget[]).map((b) => [
      b.goal_id,
      Number(b.allocated),
    ]),
  );

  const measured = progress.reduce((sum, p) => sum + Number(p.value), 0);
  const movedCount = revisions.filter((r) => r.field !== "status").length;

  return (
    <>
      <PageHeader
        title={g.title}
        description={g.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/goals/${g.id}/ancestry`}
              className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
            >
              Ancestry
              <ArrowRight className="size-3" />
            </Link>
            <EditTargetsDialog goal={g} />
          </div>
        }
      />

      <div className="flex flex-col gap-4 px-8 py-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={cn("text-[8px] leading-none", TAG_TEXT[g.color])}>●</span>
          <Badge color="gray">{HORIZON_LABEL[g.horizon]}</Badge>
          <Badge color={g.status === "active" ? "blue" : "gray"}>
            {STATUS_LABEL[g.status]}
          </Badge>
          <span className="font-mono text-text-tertiary">
            {formatDate(g.start_date)} → {formatDate(g.due_date)}
          </span>
          {movedCount > 0 ? (
            <span className="font-mono text-warning">
              moved {movedCount}×
            </span>
          ) : null}
          {g.metric_unit ? (
            <span className="font-mono text-text-tertiary">
              target {g.target_value} {g.metric_unit}
            </span>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <PaceCard pace={pace} />
          <OutcomeCard goal={g} outcome={outcome} measured={measured} />
          <EffortCard hours={effort} />
        </div>

        <ProgressPanel goalId={g.id} unit={g.metric_unit} entries={progress} />

        <LinksPanel
          goal={g}
          outgoing={outgoing}
          incoming={incoming}
          candidates={candidates}
          budgets={budgets}
        />

        <RevisionHistory revisions={revisions} />
      </div>
    </>
  );
}
