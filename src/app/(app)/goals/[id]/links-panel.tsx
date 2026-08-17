"use client";

import { TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTooltip } from "@/components/ui/tooltip";
import type { Goal, GoalLinkType } from "@/lib/supabase/types";

import { deleteLink, INITIAL } from "../actions";
import { formatNumber, formatWeight, HORIZON_LABEL } from "../display";
import { type Budgets, LinkEditor } from "./link-editor";
import { Panel } from "./panel";

export type LinkRow = {
  parent_id: string;
  child_id: string;
  link_type: GoalLinkType;
  contribution_weight: number;
  conversion_factor: number | null;
  conversion_note: string | null;
  /** The goal at the other end of this link. */
  other: Pick<Goal, "id" | "title" | "horizon" | "metric_unit" | "status">;
};

export function LinksPanel({
  goal,
  outgoing,
  incoming,
  candidates,
  budgets,
}: {
  goal: Goal;
  /** Links where this goal is the child — the parents it feeds. */
  outgoing: LinkRow[];
  /** Links where this goal is the parent — the goals feeding it. */
  incoming: LinkRow[];
  candidates: Pick<Goal, "id" | "title" | "horizon" | "metric_unit">[];
  budgets: Budgets;
}) {
  const allocated = budgets[goal.id] ?? 0;
  const free = Math.max(0, 1 - allocated);

  const contributesTo = outgoing.filter((l) => l.link_type === "contributes_to");
  const fedBy = incoming.filter((l) => l.link_type === "contributes_to");
  const dependsOn = outgoing.filter((l) => l.link_type === "depends_on");
  const blocks = incoming.filter((l) => l.link_type === "depends_on");
  const related = [...outgoing, ...incoming].filter(
    (l) => l.link_type === "relates_to",
  );

  const empty =
    contributesTo.length + fedBy.length + dependsOn.length + blocks.length + related.length ===
    0;

  return (
    <Panel
      title="Links"
      actions={<LinkEditor goal={goal} candidates={candidates} budgets={budgets} />}
    >
      {empty ? (
        <EmptyState
          title="Not linked to anything yet"
          description="A goal only earns its place in the graph once it feeds something. Link it upward to see it in the ancestry view."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Group
            title="Contributes to"
            note={
              <span className="font-mono text-text-tertiary">
                {free.toFixed(2)} of 1.00 unallocated
              </span>
            }
            links={contributesTo}
            goalUnit={goal.metric_unit}
            showWeight
          />
          <Group title="Fed by" links={fedBy} goalUnit={goal.metric_unit} showWeight />
          <Group title="Depends on" links={dependsOn} goalUnit={goal.metric_unit} />
          <Group title="Blocks" links={blocks} goalUnit={goal.metric_unit} />
          <Group title="Related" links={related} goalUnit={goal.metric_unit} />
        </div>
      )}
    </Panel>
  );
}

function Group({
  title,
  note,
  links,
  goalUnit,
  showWeight = false,
}: {
  title: string;
  note?: React.ReactNode;
  links: LinkRow[];
  goalUnit: string | null;
  showWeight?: boolean;
}) {
  if (links.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-text-secondary">{title}</h3>
        {note ? <span className="text-xs">{note}</span> : null}
      </div>
      <div className="flex flex-col gap-1">
        {links.map((link) => (
          <LinkItem
            key={`${link.parent_id}-${link.child_id}-${link.link_type}`}
            link={link}
            goalUnit={goalUnit}
            showWeight={showWeight}
          />
        ))}
      </div>
    </div>
  );
}

function LinkItem({
  link,
  goalUnit,
  showWeight,
}: {
  link: LinkRow;
  goalUnit: string | null;
  showWeight: boolean;
}) {
  const [state, formAction] = React.useActionState(deleteLink, INITIAL);

  const undeclared =
    link.link_type === "contributes_to" &&
    goalUnit !== null &&
    link.other.metric_unit !== null &&
    goalUnit !== link.other.metric_unit &&
    link.conversion_factor === null;

  return (
    <div className="group flex items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-bg-hover">
      <Badge color="gray" className="font-mono text-[10px]">
        {HORIZON_LABEL[link.other.horizon]}
      </Badge>

      <Link
        href={`/goals/${link.other.id}`}
        className="flex-1 truncate text-sm text-text hover:underline"
      >
        {link.other.title}
      </Link>

      {showWeight ? (
        <span className="font-mono text-xs text-text-secondary">
          ×{formatWeight(link.contribution_weight)}
        </span>
      ) : null}

      {link.conversion_factor !== null ? (
        <InfoTooltip label={link.conversion_note ?? "Declared conversion"}>
          <span className="font-mono text-xs text-text-tertiary">
            ×{formatNumber(link.conversion_factor, 4)}
          </span>
        </InfoTooltip>
      ) : null}

      {undeclared ? (
        <InfoTooltip
          label={
            <>
              Units differ across this link and no conversion is declared. Effort
              still rolls up; the outcome rollup stops here rather than guessing.
            </>
          }
        >
          <span className="flex items-center gap-1 text-xs text-warning">
            <TriangleAlert className="size-3" />
            no conversion
          </span>
        </InfoTooltip>
      ) : null}

      <form action={formAction}>
        <input type="hidden" name="parent_id" value={link.parent_id} />
        <input type="hidden" name="child_id" value={link.child_id} />
        <input type="hidden" name="link_type" value={link.link_type} />
        <button
          type="submit"
          aria-label={`Remove link to ${link.other.title}`}
          title={state.error ?? "Remove link"}
          className="rounded-sm p-0.5 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:bg-bg-active hover:text-danger"
        >
          <X className="size-3.5" />
        </button>
      </form>
    </div>
  );
}
