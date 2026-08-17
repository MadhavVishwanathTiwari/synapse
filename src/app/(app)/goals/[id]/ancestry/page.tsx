import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/server";
import type { AncestryEdge, Goal } from "@/lib/supabase/types";

import { AncestryGraph } from "./ancestry-graph";
import type { LayoutEdge, LayoutNode } from "./graph-layout";

export const metadata: Metadata = { title: "Ancestry" };

export default async function AncestryPage({
  params,
}: PageProps<"/goals/[id]/ancestry">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: goal } = await supabase
    .from("goals")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!goal) notFound();

  const { data: ancestry, error } = await supabase.rpc("goal_ancestry", {
    p_goal_id: id,
  });

  if (error) {
    return (
      <>
        <PageHeader title="Ancestry" />
        <div className="px-8 py-6">
          <p role="alert" className="text-sm text-danger">
            Could not load the chain: {error.message}
          </p>
        </div>
      </>
    );
  }

  const rows = (ancestry ?? []) as AncestryEdge[];

  // Every goal referenced by the chain, plus the focused one.
  const ids = new Set<string>([id]);
  for (const row of rows) {
    ids.add(row.parent_id);
    ids.add(row.child_id);
  }

  const { data: goalRows } = await supabase
    .from("goals")
    .select("id, title, horizon, color, status, metric_unit, target_value, due_date")
    .in("id", [...ids]);

  const nodes: LayoutNode[] = ((goalRows ?? []) as Pick<
    Goal,
    | "id" | "title" | "horizon" | "color" | "status"
    | "metric_unit" | "target_value" | "due_date"
  >[]).map((g) => ({
    id: g.id,
    title: g.title,
    horizon: g.horizon,
    color: g.color,
    status: g.status,
    metricUnit: g.metric_unit,
    targetValue: g.target_value === null ? null : Number(g.target_value),
    dueDate: g.due_date,
  }));

  const edges: LayoutEdge[] = rows.map((row) => ({
    parentId: row.parent_id,
    childId: row.child_id,
    weight: Number(row.contribution_weight),
    conversionFactor:
      row.conversion_factor === null ? null : Number(row.conversion_factor),
    conversionNote: row.conversion_note,
    crossesUndeclared: row.crosses_undeclared_conversion,
    share: Number(row.share),
  }));

  const topShare = edges.length > 0
    ? nodes
        .filter((n) => !edges.some((e) => e.childId === n.id))
        .map((n) => ({
          node: n,
          share: edges
            .filter((e) => e.parentId === n.id)
            .reduce((sum, e) => sum + e.share, 0),
        }))
    : [];

  return (
    <>
      <PageHeader
        title="Ancestry"
        description={`Everything ${goal.title} feeds, up to the longest horizon.`}
        actions={
          <Link
            href={`/goals/${id}`}
            className="flex items-center gap-1 rounded-sm px-2 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
          >
            <ArrowLeft className="size-3" />
            Back to goal
          </Link>
        }
      />

      <div className="px-8 py-6">
        {edges.length === 0 ? (
          <EmptyState
            title="This goal does not feed anything yet"
            description="Link it to a longer-horizon goal and the chain will appear here, with the weight carried on every hop."
            action={
              <Link
                href={`/goals/${id}`}
                className="text-xs text-accent hover:underline"
              >
                Add a link →
              </Link>
            }
          />
        ) : (
          <>
            <AncestryGraph nodes={nodes} edges={edges} focusId={id} />

            {/*
             * States the diamond property in words as well as geometry. Two arms
             * reaching the same ancestor and summing to 1.00 is the whole model
             * working; leaving the reader to infer it from the picture asks them
             * to trust the maths they came here to check.
             */}
            {topShare.length > 0 ? (
              <div className="mt-4 flex flex-col gap-1 rounded-md border border-border bg-bg-elevated p-4">
                <h2 className="text-xs font-medium tracking-wide text-text-secondary uppercase">
                  Share reaching the top
                </h2>
                {topShare.map(({ node, share }) => (
                  <p key={node.id} className="text-sm text-text">
                    <span className="font-mono text-accent">
                      {share.toFixed(2)}
                    </span>{" "}
                    of {goal.title} reaches{" "}
                    <Link href={`/goals/${node.id}`} className="hover:underline">
                      {node.title}
                    </Link>
                  </p>
                ))}
                <p className="mt-1 text-xs text-text-tertiary">
                  Where two routes reach the same goal their shares add, so effort
                  is attributed once rather than counted twice.
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
