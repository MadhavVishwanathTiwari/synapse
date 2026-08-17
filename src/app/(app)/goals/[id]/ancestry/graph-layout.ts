/**
 * Layout for the ancestry graph. Pure — no React, no DOM, fully testable.
 *
 * Layers are fixed by horizon: day on the left through decade on the right.
 * Not longest-path layering, which is the usual choice for a DAG, and the
 * difference matters. A fixed axis means a goal always sits in the same column
 * whichever view you opened, and a day goal that contributes straight to a year
 * goal visibly skips three columns — that leap is information. Longest-path
 * layering would pack the columns and hide exactly that.
 *
 * Vertical placement is a two-pass barycentre sweep. Every ordering comparison
 * is total, so the same graph always produces the same picture; a layout that
 * reshuffled between renders would make the screen feel untrustworthy even when
 * the numbers were right.
 */

import { GOAL_HORIZONS, type GoalHorizon, type GoalStatus, type NotionColor } from "@/lib/supabase/types";

export const COL_W = 260;
export const NODE_W = 180;
export const NODE_H = 64;
export const V_GAP = 20;
export const PAD = 48;

export type LayoutNode = {
  id: string;
  title: string;
  horizon: GoalHorizon;
  color: NotionColor;
  status: GoalStatus;
  metricUnit: string | null;
  targetValue: number | null;
  dueDate: string;
};

export type LayoutEdge = {
  parentId: string;
  childId: string;
  weight: number;
  conversionFactor: number | null;
  conversionNote: string | null;
  /** Units differ and no conversion is declared: outcome stops here. */
  crossesUndeclared: boolean;
  /** Accumulated share of the focused goal's effort flowing along this hop. */
  share: number;
};

export type PositionedNode = LayoutNode & {
  x: number;
  y: number;
  layer: number;
};

export type RoutedEdge = LayoutEdge & {
  path: string;
  labelX: number;
  labelY: number;
  /** Half the label plate's width, shrunk to fit the gap between two columns. */
  labelHalfWidth: number;
  /** The parent is not to the right of the child — a lateral or inverted link. */
  lateral: boolean;
};

export type Layout = {
  nodes: PositionedNode[];
  edges: RoutedEdge[];
  width: number;
  height: number;
  /** Layers that contain at least one node, for dimming the empty ones. */
  occupiedLayers: Set<number>;
};

export function layerOf(horizon: GoalHorizon): number {
  return GOAL_HORIZONS.indexOf(horizon);
}

function xOf(layer: number) {
  return PAD + layer * COL_W;
}

export function computeLayout(
  nodes: readonly LayoutNode[],
  edges: readonly LayoutEdge[],
): Layout {
  const known = new Set(nodes.map((n) => n.id));
  // Ignore edges pointing at goals we were not given, rather than producing NaN
  // coordinates for them later.
  const live = edges.filter((e) => known.has(e.parentId) && known.has(e.childId));

  const byLayer = new Map<number, LayoutNode[]>();
  for (const node of nodes) {
    const layer = layerOf(node.horizon);
    const list = byLayer.get(layer);
    if (list) list.push(node);
    else byLayer.set(layer, [node]);
  }

  // Children of a node, restricted to strictly lower layers so the sweep only
  // ever reads positions it has already assigned.
  const childrenOf = new Map<string, string[]>();
  for (const edge of live) {
    const list = childrenOf.get(edge.parentId);
    if (list) list.push(edge.childId);
    else childrenOf.set(edge.parentId, [edge.childId]);
  }

  const shareOf = new Map<string, number>();
  for (const edge of live) {
    shareOf.set(edge.childId, Math.max(shareOf.get(edge.childId) ?? 0, edge.share));
  }

  const y = new Map<string, number>();
  const layerIndexOf = new Map<string, number>();
  for (const [layer, list] of byLayer) {
    for (const node of list) layerIndexOf.set(node.id, layer);
  }

  const barycentre = (node: LayoutNode, layer: number) => {
    const kids = (childrenOf.get(node.id) ?? []).filter(
      (id) => (layerIndexOf.get(id) ?? -1) < layer && y.has(id),
    );
    if (kids.length === 0) return null;
    return kids.reduce((sum, id) => sum + (y.get(id) ?? 0), 0) / kids.length;
  };

  const seat = (layer: number) => {
    const list = byLayer.get(layer);
    if (!list) return;

    const seated = list
      .map((node) => ({ node, b: barycentre(node, layer) }))
      .sort((a, b) => {
        // Nodes with no placed children sink to the bottom of the column rather
        // than jumping to the top, which is what `null` would otherwise do.
        if (a.b === null && b.b === null) return compareFallback(a.node, b.node, shareOf);
        if (a.b === null) return 1;
        if (b.b === null) return -1;
        if (a.b !== b.b) return a.b - b.b;
        return compareFallback(a.node, b.node, shareOf);
      });

    let cursor = -Infinity;
    for (const { node, b } of seated) {
      const wanted = b ?? cursor + NODE_H + V_GAP;
      const placed = Math.max(wanted, cursor + NODE_H + V_GAP);
      y.set(node.id, Number.isFinite(placed) ? placed : 0);
      cursor = y.get(node.id)!;
    }
  };

  const layers = [...byLayer.keys()].sort((a, b) => a - b);

  // Initial sweep plus two refinements. At this size the positions converge; a
  // third pass changes nothing measurable.
  for (const layer of layers) seat(layer);
  for (let pass = 0; pass < 2; pass += 1) {
    for (const layer of layers) seat(layer);
  }

  // Centre every column on the same midline so the graph reads as one figure
  // rather than a set of independently floating stacks.
  let height = 0;
  for (const layer of layers) {
    const list = byLayer.get(layer)!;
    const top = Math.min(...list.map((n) => y.get(n.id)!));
    const bottom = Math.max(...list.map((n) => y.get(n.id)! + NODE_H));
    height = Math.max(height, bottom - top);
  }
  height = Math.max(height, NODE_H) + PAD * 2;

  for (const layer of layers) {
    const list = byLayer.get(layer)!;
    const top = Math.min(...list.map((n) => y.get(n.id)!));
    const bottom = Math.max(...list.map((n) => y.get(n.id)! + NODE_H));
    const offset = (height - (bottom - top)) / 2 - top;
    for (const node of list) y.set(node.id, y.get(node.id)! + offset);
  }

  const positioned: PositionedNode[] = nodes.map((node) => {
    const layer = layerOf(node.horizon);
    return { ...node, layer, x: xOf(layer), y: y.get(node.id) ?? PAD };
  });

  const positionById = new Map(positioned.map((n) => [n.id, n]));
  const width = xOf(GOAL_HORIZONS.length - 1) + NODE_W + PAD;

  return {
    nodes: positioned,
    edges: routeEdges(live, positionById),
    width,
    height,
    occupiedLayers: new Set(layers),
  };
}

function compareFallback(
  a: LayoutNode,
  b: LayoutNode,
  shareOf: Map<string, number>,
) {
  const shareDiff = (shareOf.get(b.id) ?? 0) - (shareOf.get(a.id) ?? 0);
  if (shareDiff !== 0) return shareDiff;
  const titleDiff = a.title.localeCompare(b.title);
  // Ids as the last resort: two goals can share a title, and without a total
  // order the layout would flip between renders.
  return titleDiff !== 0 ? titleDiff : a.id.localeCompare(b.id);
}

function routeEdges(
  edges: readonly LayoutEdge[],
  positions: Map<string, PositionedNode>,
): RoutedEdge[] {
  /*
   * Anchors fan out across each node's edge rather than all leaving from the
   * midpoint. This is what makes a diamond read as two distinct routes from the
   * first pixel instead of two lines that overlap for a hundred pixels and then
   * separate.
   */
  const outgoing = new Map<string, LayoutEdge[]>();
  const incoming = new Map<string, LayoutEdge[]>();

  const sortByCounterpart = (list: LayoutEdge[], key: "parentId" | "childId") =>
    list.sort(
      (a, b) =>
        (positions.get(a[key])?.y ?? 0) - (positions.get(b[key])?.y ?? 0) ||
        a[key].localeCompare(b[key]),
    );

  const push = (map: Map<string, LayoutEdge[]>, key: string, edge: LayoutEdge) => {
    const list = map.get(key);
    if (list) list.push(edge);
    else map.set(key, [edge]);
  };

  for (const edge of edges) {
    push(outgoing, edge.childId, edge);
    push(incoming, edge.parentId, edge);
  }
  for (const list of outgoing.values()) sortByCounterpart(list, "parentId");
  for (const list of incoming.values()) sortByCounterpart(list, "childId");

  return edges.map((edge) => {
    const child = positions.get(edge.childId)!;
    const parent = positions.get(edge.parentId)!;

    const out = outgoing.get(edge.childId)!;
    const inc = incoming.get(edge.parentId)!;
    const outIndex = out.indexOf(edge);
    const incIndex = inc.indexOf(edge);

    const x1 = child.x + NODE_W;
    const y1 = child.y + (NODE_H * (outIndex + 1)) / (out.length + 1);
    const x2 = parent.x;
    const y2 = parent.y + (NODE_H * (incIndex + 1)) / (inc.length + 1);

    const lateral = parent.layer <= child.layer;
    const dx = lateral ? 60 : Math.max(40, (x2 - x1) * 0.42);

    const c1x = x1 + dx;
    const c2x = x2 - dx;

    /*
     * Labels go in the clear space between two columns, never at the raw curve
     * midpoint. An edge that skips a horizon — a day goal feeding a year goal —
     * has its midpoint sitting squarely on whatever occupies the column in
     * between, and the label would be drawn underneath that node. Snapping to
     * the nearest inter-column gap keeps every label legible and, incidentally,
     * lines them up in tidy vertical channels.
     */
    const labelHalfWidth = Math.min(48, (COL_W - NODE_W - 8) / 2);
    const gapCentre = (layer: number) =>
      PAD + layer * COL_W + NODE_W + (COL_W - NODE_W) / 2;

    // Analytic midpoint of a cubic at t = 0.5: (P0 + 3P1 + 3P2 + P3) / 8.
    const midX = (x1 + 3 * c1x + 3 * c2x + x2) / 8;

    const lowLayer = Math.min(child.layer, parent.layer);
    const highLayer = Math.max(child.layer, parent.layer);

    let labelX = midX;
    if (highLayer > lowLayer) {
      labelX = gapCentre(lowLayer);
      for (let l = lowLayer + 1; l < highLayer; l += 1) {
        if (Math.abs(gapCentre(l) - midX) < Math.abs(labelX - midX)) {
          labelX = gapCentre(l);
        }
      }
    }

    // Put the label on the curve rather than beside it: sample the cubic and
    // take the y where its x is closest to the chosen label position.
    const at = (t: number, p0: number, p1: number, p2: number, p3: number) => {
      const u = 1 - t;
      return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    };

    let labelY = at(0.5, y1, y1, y2, y2);
    let closest = Infinity;
    for (let i = 0; i <= 32; i += 1) {
      const t = i / 32;
      const distance = Math.abs(at(t, x1, c1x, c2x, x2) - labelX);
      if (distance < closest) {
        closest = distance;
        labelY = at(t, y1, y1, y2, y2);
      }
    }

    return {
      ...edge,
      path: `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`,
      labelX,
      labelY,
      labelHalfWidth,
      lateral,
    };
  });
}
