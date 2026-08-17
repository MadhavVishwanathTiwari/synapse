/**
 * Weighted effort rollup over the goal DAG.
 *
 * SQL counterpart: `public.goal_effort_shares` and `public.goal_effort_rollup`.
 * Those are authoritative. This mirror exists so the weighting rule — the one
 * property the whole graph model rests on — can be tested against fixtures that
 * are checkable by hand.
 */

export type EffortEdge = {
  parentId: string;
  childId: string;
  /** Share of the CHILD's effort attributed to this parent. */
  weight: number;
};

/**
 * The fraction of each descendant's effort that reaches `rootId`.
 *
 * Accumulates weights multiplicatively along each path and sums over paths. That
 * distinction is the whole point, and it is what makes a diamond come out right:
 *
 *   A →0.5→ B →1.0→ D
 *   A →0.5→ C →1.0→ D
 *
 * A is reached from D twice, at 0.5 each, totalling 1.0 — counted exactly once.
 * Deduplicating visited nodes, the intuitive alternative, would keep one arm and
 * report half of A's effort. Summing without weights would report double.
 *
 * Termination is guaranteed by the acyclicity trigger on `goal_links`; the depth
 * cap is a backstop for graphs assembled in memory that never reached the
 * database.
 */
export function effortShares(
  rootId: string,
  edges: readonly EffortEdge[],
  maxDepth = 32,
): Map<string, number> {
  const childrenOf = new Map<string, EffortEdge[]>();
  for (const edge of edges) {
    const list = childrenOf.get(edge.parentId);
    if (list) list.push(edge);
    else childrenOf.set(edge.parentId, [edge]);
  }

  const shares = new Map<string, number>();

  // One frontier entry per PATH, not per node.
  let frontier: { id: string; share: number }[] = [{ id: rootId, share: 1 }];
  let depth = 0;

  while (frontier.length > 0 && depth <= maxDepth) {
    const next: { id: string; share: number }[] = [];

    for (const { id, share } of frontier) {
      shares.set(id, (shares.get(id) ?? 0) + share);

      for (const edge of childrenOf.get(id) ?? []) {
        next.push({ id: edge.childId, share: share * edge.weight });
      }
    }

    frontier = next;
    depth += 1;
  }

  return shares;
}

/**
 * Total effort attributable to `rootId`: each goal's own logged hours weighted by
 * the share of it that reaches the root.
 *
 * `ownHours` is keyed by goal id. In the database this term comes from
 * `public.goal_own_hours`, which returns 0 until the Phase 2 time ledger exists.
 */
export function effortRollup(
  rootId: string,
  ownHours: ReadonlyMap<string, number>,
  edges: readonly EffortEdge[],
): number {
  let total = 0;
  for (const [goalId, share] of effortShares(rootId, edges)) {
    total += (ownHours.get(goalId) ?? 0) * share;
  }
  return total;
}
