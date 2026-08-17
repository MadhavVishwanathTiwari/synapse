import { describe, expect, it } from "vitest";

import {
  computeLayout,
  COL_W,
  type LayoutEdge,
  type LayoutNode,
  layerOf,
  NODE_H,
  NODE_W,
} from "./graph-layout";

function node(
  id: string,
  horizon: LayoutNode["horizon"],
  title = id,
): LayoutNode {
  return {
    id,
    title,
    horizon,
    color: "gray",
    status: "active",
    metricUnit: null,
    targetValue: null,
    dueDate: "2026-12-31",
  };
}

function edge(
  parentId: string,
  childId: string,
  extra: Partial<LayoutEdge> = {},
): LayoutEdge {
  return {
    parentId,
    childId,
    weight: 1,
    conversionFactor: null,
    conversionNote: null,
    crossesUndeclared: false,
    share: 1,
    ...extra,
  };
}

/** The diamond: one day goal reaching one decade goal by two routes. */
const DIAMOND_NODES = [
  node("leaf", "day"),
  node("b", "month", "B branch"),
  node("c", "month", "C branch"),
  node("top", "year"),
];

const DIAMOND_EDGES = [
  edge("b", "leaf", { weight: 0.7, share: 0.7 }),
  edge("c", "leaf", { weight: 0.3, share: 0.3 }),
  edge("top", "b", { share: 0.7 }),
  edge("top", "c", { share: 0.3 }),
];

describe("layerOf", () => {
  it("orders the horizons shortest to longest", () => {
    expect(layerOf("day")).toBe(0);
    expect(layerOf("decade")).toBe(5);
    expect(layerOf("month")).toBeGreaterThan(layerOf("week"));
  });
});

describe("computeLayout", () => {
  it("places each node in its horizon's column", () => {
    const { nodes } = computeLayout(DIAMOND_NODES, DIAMOND_EDGES);
    const leaf = nodes.find((n) => n.id === "leaf")!;
    const top = nodes.find((n) => n.id === "top")!;

    expect(leaf.layer).toBe(layerOf("day"));
    expect(top.layer).toBe(layerOf("year"));
    expect(top.x - leaf.x).toBe(COL_W * (layerOf("year") - layerOf("day")));
  });

  it("keeps a fixed axis so a skipped horizon stays visible as a gap", () => {
    // A day goal contributing straight to a decade goal must span five columns,
    // not be packed into adjacent ones.
    const { nodes } = computeLayout(
      [node("task", "day"), node("life", "decade")],
      [edge("life", "task")],
    );
    const task = nodes.find((n) => n.id === "task")!;
    const life = nodes.find((n) => n.id === "life")!;
    expect(life.x - task.x).toBe(COL_W * 5);
  });

  it("returns one routed edge per link", () => {
    const { edges } = computeLayout(DIAMOND_NODES, DIAMOND_EDGES);
    expect(edges).toHaveLength(4);
    for (const e of edges) {
      expect(e.path).toMatch(/^M [\d.-]+ [\d.-]+ C /);
      expect(Number.isFinite(e.labelX)).toBe(true);
      expect(Number.isFinite(e.labelY)).toBe(true);
    }
  });

  it("never overlaps two nodes in the same column", () => {
    const { nodes } = computeLayout(DIAMOND_NODES, DIAMOND_EDGES);
    const b = nodes.find((n) => n.id === "b")!;
    const c = nodes.find((n) => n.id === "c")!;
    expect(Math.abs(b.y - c.y)).toBeGreaterThanOrEqual(NODE_H);
  });

  it("fans a diamond's two routes out to distinct anchors", () => {
    // Both edges leave the same node. If they shared an anchor the two arms
    // would be drawn on top of each other and the split would be invisible.
    const { edges } = computeLayout(DIAMOND_NODES, DIAMOND_EDGES);
    const fromLeaf = edges.filter((e) => e.childId === "leaf");
    expect(fromLeaf).toHaveLength(2);

    const starts = fromLeaf.map((e) => e.path.split(" ")[2]);
    expect(new Set(starts).size).toBe(2);
  });

  it("is deterministic across runs", () => {
    const a = computeLayout(DIAMOND_NODES, DIAMOND_EDGES);
    const b = computeLayout([...DIAMOND_NODES].reverse(), [...DIAMOND_EDGES].reverse());

    const key = (l: typeof a) =>
      l.nodes
        .map((n) => `${n.id}:${n.x}:${n.y}`)
        .sort()
        .join("|");

    expect(key(a)).toBe(key(b));
  });

  it("produces no NaN for a same-horizon link", () => {
    // Legal in the schema: parent and child can share a horizon.
    const { nodes, edges } = computeLayout(
      [node("a", "week"), node("b", "week")],
      [edge("b", "a")],
    );
    for (const n of nodes) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
    expect(edges[0].lateral).toBe(true);
    expect(edges[0].path).not.toMatch(/NaN/);
  });

  it("ignores edges pointing at goals it was not given", () => {
    const { edges } = computeLayout([node("solo", "day")], [edge("ghost", "solo")]);
    expect(edges).toHaveLength(0);
  });

  it("handles a single node without collapsing the canvas", () => {
    const { nodes, width, height } = computeLayout([node("solo", "quarter")], []);
    expect(nodes).toHaveLength(1);
    expect(width).toBeGreaterThan(NODE_W);
    expect(height).toBeGreaterThanOrEqual(NODE_H);
    expect(Number.isFinite(nodes[0].y)).toBe(true);
  });

  it("keeps a skipping edge's label out of the column it passes over", () => {
    // A day goal feeding a decade goal crosses four occupied-or-not columns.
    // The label must land in a gap between columns, never on a node's footprint.
    const { edges, nodes } = computeLayout(
      [node("task", "day"), node("mid", "month"), node("life", "decade")],
      [edge("life", "task"), edge("mid", "task")],
    );

    const skipping = edges.find((e) => e.parentId === "life")!;
    for (const n of nodes) {
      const overlapsHorizontally =
        skipping.labelX + skipping.labelHalfWidth > n.x &&
        skipping.labelX - skipping.labelHalfWidth < n.x + NODE_W;
      expect(overlapsHorizontally).toBe(false);
    }
  });

  it("places labels on the curve, not beside it", () => {
    const { edges } = computeLayout(DIAMOND_NODES, DIAMOND_EDGES);
    for (const e of edges) {
      expect(Number.isFinite(e.labelY)).toBe(true);
      expect(e.labelHalfWidth).toBeGreaterThan(0);
    }
  });

  it("reports which layers are occupied so empty ones can be dimmed", () => {
    const { occupiedLayers } = computeLayout(
      [node("task", "day"), node("life", "decade")],
      [edge("life", "task")],
    );
    expect([...occupiedLayers].sort()).toEqual([0, 5]);
  });

  it("keeps every node on the canvas", () => {
    const { nodes, height } = computeLayout(DIAMOND_NODES, DIAMOND_EDGES);
    for (const n of nodes) {
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y + NODE_H).toBeLessThanOrEqual(height);
    }
  });
});
