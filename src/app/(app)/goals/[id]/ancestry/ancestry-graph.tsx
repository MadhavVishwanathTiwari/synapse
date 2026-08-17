"use client";

import { Minus, Plus, Scan, TriangleAlert } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { TAG_TEXT } from "@/components/ui/badge";
import { GOAL_HORIZONS } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

import { formatShortDate, formatWeight, HORIZON_LABEL } from "../../display";
import {
  COL_W,
  computeLayout,
  type LayoutEdge,
  type LayoutNode,
  NODE_H,
  NODE_W,
  PAD,
} from "./graph-layout";

/**
 * The ancestry visualiser.
 *
 * Hand-rolled SVG rather than a graph library. The layout is already decided by
 * the horizon axis, so a library would contribute a pan-zoom shell and a visual
 * language that would then have to be overridden back into this one.
 *
 * Every colour is a Tailwind class rather than an inline value: v4 generates
 * `stroke-*` and `fill-*` utilities from the `@theme` tokens in globals.css, so
 * "tokens only, no raw hex" holds inside the SVG too.
 */
export function AncestryGraph({
  nodes,
  edges,
  focusId,
  interactive = true,
  className,
}: {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  focusId: string;
  interactive?: boolean;
  className?: string;
}) {
  const layout = React.useMemo(() => computeLayout(nodes, edges), [nodes, edges]);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [view, setView] = React.useState({ k: 1, tx: 0, ty: 0 });
  const dragging = React.useRef<{ x: number; y: number } | null>(null);

  /*
   * The set of edges on a path through the hovered node, so hovering one arm of
   * a diamond dims the other. Without this a dense graph is a tangle; with it,
   * it explains itself.
   */
  const lit = React.useMemo(() => {
    if (!hovered) return null;
    const keep = new Set<string>();
    const up = new Set([hovered]);
    const down = new Set([hovered]);

    for (let i = 0; i < GOAL_HORIZONS.length; i += 1) {
      for (const e of layout.edges) {
        if (up.has(e.childId)) up.add(e.parentId);
        if (down.has(e.parentId)) down.add(e.childId);
      }
    }
    for (const e of layout.edges) {
      if ((up.has(e.childId) && up.has(e.parentId)) ||
          (down.has(e.childId) && down.has(e.parentId))) {
        keep.add(edgeKey(e));
      }
    }
    return keep;
  }, [hovered, layout.edges]);

  const onWheel = (event: React.WheelEvent) => {
    if (!interactive) return;
    event.preventDefault();
    setView((v) => ({
      ...v,
      k: Math.min(2, Math.max(0.3, v.k * (event.deltaY < 0 ? 1.1 : 0.9))),
    }));
  };

  const fit = () => setView({ k: 1, tx: 0, ty: 0 });

  const undeclaredCount = layout.edges.filter((e) => e.crossesUndeclared).length;

  /*
   * Goals sitting immediately above an undeclared boundary. Marking the node as
   * well as the edge means the refusal is unmissable whether you scan the graph
   * by following lines or by reading boxes.
   */
  const beyondBoundary = React.useMemo(
    () =>
      new Set(
        layout.edges.filter((e) => e.crossesUndeclared).map((e) => e.parentId),
      ),
    [layout.edges],
  );

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height + 40}`}
        preserveAspectRatio="xMidYMid meet"
        className={cn("w-full", interactive && "cursor-grab active:cursor-grabbing")}
        style={{ height: interactive ? "min(70vh, 640px)" : 200 }}
        onWheel={onWheel}
        onPointerDown={(e) => {
          if (!interactive) return;
          dragging.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          const dx = e.clientX - dragging.current.x;
          const dy = e.clientY - dragging.current.y;
          dragging.current = { x: e.clientX, y: e.clientY };
          setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
        }}
        onPointerUp={() => (dragging.current = null)}
        onPointerLeave={() => (dragging.current = null)}
      >
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          {/* Column guides. Empty horizons stay in place, dimmed, so the shape
              of the chain is legible even where it is sparse. */}
          {GOAL_HORIZONS.map((horizon, layer) => {
            const x = PAD + layer * COL_W;
            const occupied = layout.occupiedLayers.has(layer);
            return (
              <g key={horizon}>
                <line
                  x1={x + NODE_W / 2}
                  y1={28}
                  x2={x + NODE_W / 2}
                  y2={layout.height}
                  className={cn("stroke-border", occupied ? "opacity-50" : "opacity-20")}
                  strokeWidth={1}
                />
                <text
                  x={x + NODE_W / 2}
                  y={16}
                  textAnchor="middle"
                  className={cn(
                    "text-[10px] tracking-wider uppercase",
                    occupied ? "fill-text-secondary" : "fill-text-tertiary",
                  )}
                >
                  {HORIZON_LABEL[horizon]}
                </text>
              </g>
            );
          })}

          <g transform="translate(0 40)">
            {layout.edges.map((edge) => {
              const key = edgeKey(edge);
              const dimmed = lit !== null && !lit.has(key);
              const width = Math.min(3.5, 1 + 2.5 * Number(edge.share));

              return (
                <g key={key} className={cn(dimmed && "opacity-20")}>
                  <path
                    d={edge.path}
                    fill="none"
                    strokeWidth={width}
                    strokeDasharray={
                      edge.crossesUndeclared ? "4 4" : edge.lateral ? "1 3" : undefined
                    }
                    className={cn(
                      edge.crossesUndeclared
                        ? "stroke-warning"
                        : lit?.has(key)
                          ? "stroke-accent"
                          : "stroke-border-strong",
                    )}
                  />

                  {view.k >= 0.7 ? (
                    <EdgeLabel edge={edge} />
                  ) : null}
                </g>
              );
            })}

            {layout.nodes.map((node) => (
              <foreignObject
                key={node.id}
                x={node.x}
                y={node.y}
                width={NODE_W}
                height={NODE_H}
                onMouseEnter={() => setHovered(node.id)}
                onMouseLeave={() => setHovered(null)}
              >
                <NodeCard
                  node={node}
                  focused={node.id === focusId}
                  beyondBoundary={beyondBoundary.has(node.id)}
                />
              </foreignObject>
            ))}
          </g>
        </g>
      </svg>

      {interactive ? (
        <>
          <div className="absolute right-3 bottom-3 flex gap-1 rounded-md border border-border bg-bg-elevated p-1">
            <ZoomButton onClick={() => setView((v) => ({ ...v, k: Math.max(0.3, v.k * 0.9) }))}>
              <Minus className="size-3.5" />
            </ZoomButton>
            <ZoomButton onClick={fit}>
              <Scan className="size-3.5" />
            </ZoomButton>
            <ZoomButton onClick={() => setView((v) => ({ ...v, k: Math.min(2, v.k * 1.1) }))}>
              <Plus className="size-3.5" />
            </ZoomButton>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-text-tertiary">
            <Legend className="bg-border-strong">effort and outcome both roll up</Legend>
            <Legend className="bg-warning" dashed>
              outcome stops here — no conversion declared
            </Legend>
            <Legend className="bg-border-strong" dotted>
              same horizon
            </Legend>
            {undeclaredCount > 0 ? (
              <span className="flex items-center gap-1 text-warning">
                <TriangleAlert className="size-3" />
                {undeclaredCount} {undeclaredCount === 1 ? "boundary" : "boundaries"} not
                summed
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function edgeKey(edge: { parentId: string; childId: string }) {
  return `${edge.parentId}->${edge.childId}`;
}

/**
 * The weight on a hop, and where the outcome rollup gives up.
 *
 * The boundary is marked on the edge AND on the node beyond it, because someone
 * scanning nodes and someone tracing edges should both hit it. Silently summing
 * across here would be a fabricated metric; saying nothing at all would look
 * like a bug.
 */
function EdgeLabel({ edge }: { edge: ReturnType<typeof computeLayout>["edges"][number] }) {
  const lines = edge.crossesUndeclared ? 2 : edge.conversionFactor !== null ? 2 : 1;
  const h = 6 + lines * 11;
  const w = edge.labelHalfWidth;

  return (
    <g transform={`translate(${edge.labelX} ${edge.labelY})`}>
      <rect
        x={-w}
        y={-h / 2}
        width={w * 2}
        height={h}
        rx={3}
        className={cn("fill-bg", edge.crossesUndeclared && "stroke-warning")}
        strokeWidth={edge.crossesUndeclared ? 1 : 0}
      />
      <text textAnchor="middle" className="font-mono text-[10px]">
        <tspan x={0} dy={lines === 1 ? 3 : -h / 2 + 12} className="fill-text-secondary">
          ×{formatWeight(edge.weight)}
        </tspan>
        {edge.conversionFactor !== null ? (
          <tspan x={0} dy={11} className="fill-text-tertiary">
            →×{edge.conversionFactor}
          </tspan>
        ) : null}
        {/*
         * Short enough to fit the gap between two adjacent columns. The full
         * explanation lives in the legend and on the node beyond this hop, so
         * nothing depends on cramming it in here.
         */}
        {edge.crossesUndeclared ? (
          <tspan x={0} dy={11} className="fill-warning">
            no conv.
          </tspan>
        ) : null}
      </text>
    </g>
  );
}

function NodeCard({
  node,
  focused,
  beyondBoundary,
}: {
  node: ReturnType<typeof computeLayout>["nodes"][number];
  focused: boolean;
  beyondBoundary: boolean;
}) {
  return (
    <Link
      href={`/goals/${node.id}`}
      title={
        beyondBoundary
          ? "Effort rolls up across the hop below; outcome does not."
          : undefined
      }
      className={cn(
        "flex h-full w-full flex-col justify-between overflow-hidden rounded-md border bg-bg-elevated px-2 py-1.5",
        "transition-colors hover:bg-bg-hover",
        focused ? "border-accent" : "border-border",
        beyondBoundary && "border-l-2 border-l-warning",
      )}
    >
      <div className="flex gap-1.5">
        <span className={cn("mt-0.5 text-[8px] leading-none", TAG_TEXT[node.color])}>
          ●
        </span>
        <span
          className={cn(
            "line-clamp-2 text-[11px] leading-snug text-text",
            node.status === "done" && "text-text-secondary line-through",
          )}
        >
          {node.title}
        </span>
      </div>
      {beyondBoundary ? (
        <span className="truncate text-[9px] text-warning">
          outcome not summed across this hop
        </span>
      ) : (
        <div className="flex items-center justify-between gap-1 font-mono text-[9px] text-text-tertiary">
          <span>{HORIZON_LABEL[node.horizon]}</span>
          <span>{formatShortDate(node.dueDate)}</span>
        </div>
      )}
    </Link>
  );
}

function ZoomButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm p-1 text-text-secondary transition-colors hover:bg-bg-hover hover:text-text"
    >
      {children}
    </button>
  );
}

function Legend({
  className,
  dashed,
  dotted,
  children,
}: {
  className?: string;
  dashed?: boolean;
  dotted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn("h-px w-6", className)}
        style={
          dashed
            ? { backgroundImage: "repeating-linear-gradient(90deg,currentColor 0 4px,transparent 4px 8px)" }
            : dotted
              ? { backgroundImage: "repeating-linear-gradient(90deg,currentColor 0 1px,transparent 1px 4px)" }
              : undefined
        }
      />
      {children}
    </span>
  );
}
