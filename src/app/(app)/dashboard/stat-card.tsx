import { cn } from "@/lib/utils";

/**
 * One headline number, with its denominator and a sentence.
 *
 * The same shape as the metric cards in the day-close dialog, and for the same
 * reason: a bare percentage is unauditable. "31%" invites the question "of
 * what?" and gives the reader no way to answer it, so the count that produced it
 * travels with it — `16 of 64 slots` — and a sentence says what the ratio means.
 *
 * When the metric is undefined, `detail` carries the reason rather than the
 * count. That is the whole contract of this component: there is never a state in
 * which it shows a dash with no explanation.
 */
export function StatCard({
  label,
  value,
  detail,
  sentence,
  /** True when the metric is undefined, which mutes the figure and its dash. */
  undefinedMetric = false,
  footnote,
}: {
  label: string;
  value: string;
  detail: string;
  sentence: string;
  undefinedMetric?: boolean;
  footnote?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-bg-elevated p-4">
      <p className="text-xs text-text-secondary">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-2xl",
          undefinedMetric ? "text-text-tertiary" : "text-text",
        )}
      >
        {value}
      </p>
      <p className="mt-1 font-mono text-xs text-text-tertiary">{detail}</p>
      <p className="mt-1.5 text-xs text-text-secondary">{sentence}</p>
      {footnote ? (
        <p className="mt-2 border-t border-border pt-2 text-xs text-text-tertiary">
          {footnote}
        </p>
      ) : null}
    </div>
  );
}
