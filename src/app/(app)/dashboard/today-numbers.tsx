import type {
  AllocationSummary,
  DayCoverage,
  DayFidelity,
} from "@/lib/supabase/types";

import {
  ALLOCATION_CAVEAT,
  formatHours,
  formatPercent,
  METRIC_SENTENCE,
  UNDEFINED_SENTENCE,
} from "./display";
import { StatCard } from "./stat-card";

/**
 * The three ADR 007 adherence numbers for one day, each with its denominator.
 *
 * They are never blended. 100% coverage with 20% fidelity means you tracked
 * everything and followed none of it, and any weighted average of the two
 * destroys exactly the information that makes them actionable.
 *
 * Every value here comes from a SQL function. Nothing on this page divides.
 */
export function TodayNumbers({
  coverage,
  fidelity,
  allocation,
}: {
  coverage: DayCoverage | null;
  fidelity: DayFidelity | null;
  allocation: AllocationSummary | null;
}) {
  const noWindow = !coverage || coverage.expected === 0;
  const noPlan = !fidelity || fidelity.planned === 0;
  const noHours = !allocation || allocation.logged_hours === 0;

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="Coverage today"
        value={formatPercent(coverage?.coverage ?? null)}
        detail={
          noWindow
            ? "No waking window to measure against."
            : `${coverage.logged} of ${coverage.expected} slots in your waking window`
        }
        sentence={
          noWindow ? UNDEFINED_SENTENCE.coverage : METRIC_SENTENCE.coverage
        }
        undefinedMetric={noWindow}
      />

      <StatCard
        label="Fidelity today"
        value={formatPercent(fidelity?.fidelity ?? null)}
        detail={
          noPlan
            ? "Nothing was planned for today."
            : `${fidelity.honoured} of ${fidelity.planned} planned slots honoured`
        }
        sentence={
          noPlan ? UNDEFINED_SENTENCE.fidelity : METRIC_SENTENCE.fidelity
        }
        undefinedMetric={noPlan}
      />

      <StatCard
        label="Allocation today"
        value={formatPercent(allocation?.productive_share ?? null)}
        detail={
          noHours
            ? "Nothing is logged for today yet."
            : `${formatHours(allocation.productive_hours)} of ${formatHours(allocation.logged_hours)} logged`
        }
        sentence={
          noHours ? UNDEFINED_SENTENCE.allocation : METRIC_SENTENCE.allocation
        }
        undefinedMetric={noHours}
        footnote={noHours ? undefined : ALLOCATION_CAVEAT}
      />
    </section>
  );
}
