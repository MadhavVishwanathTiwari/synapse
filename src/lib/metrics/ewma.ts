/**
 * Exponentially weighted moving average.
 *
 * SQL counterpart: the EWMA loop inside `public.goal_pace`. That definition is
 * the authoritative one — the bot and the dashboard both read it. This mirror
 * exists to be unit-tested against hand-computed fixtures and to smooth series
 * for rendering. If the two ever disagree, the SQL is right.
 */

/**
 * The smoothing factor for a given half-life in days.
 *
 * `α = 1 − 2^(−1/h)` is the value for which a sample's weight has halved after
 * exactly `h` days, which is the property the half-life setting promises.
 */
export function alphaFromHalfLife(halfLifeDays: number): number {
  if (halfLifeDays <= 0) {
    throw new RangeError("half-life must be positive");
  }
  return 1 - Math.pow(2, -1 / halfLifeDays);
}

/**
 * Bias-corrected EWMA over a dense, chronologically ordered series.
 *
 * Each observation's weight is `(1 − α)` raised to its age in samples, and the
 * total is divided by the sum of those weights.
 *
 * The normalisation is not cosmetic. The recursive form seeded with the first
 * observation gives that first sample a weight of 1 while every later one is
 * weighted α, and on the short series this app deals in — a week-horizon goal
 * has seven points — the seed never decays out. That made the metric run
 * backwards: with a three-day half-life, ten emails sent three days ago read
 * 6.3/day while the same ten sent today read 2.1/day. Dividing by the weight
 * sum makes a day's influence depend on its age and nothing else.
 *
 * Returns null for an empty series — not 0. A rate of zero and the absence of
 * any data are different claims and the UI renders them differently.
 */
export function ewma(
  values: readonly number[],
  halfLifeDays: number,
): number | null {
  if (values.length === 0) return null;

  const decay = 1 - alphaFromHalfLife(halfLifeDays);
  const last = values.length - 1;

  let weighted = 0;
  let weights = 0;

  for (let i = 0; i < values.length; i += 1) {
    const weight = Math.pow(decay, last - i);
    weighted += weight * values[i];
    weights += weight;
  }

  return weighted / weights;
}

/**
 * Expands sparse daily entries into one value per day across `[start, end]`.
 *
 * The gaps must become real zeros. A goal touched once a fortnight has a low
 * rate, not a high rate with missing days, and skipping absent days would
 * report the latter.
 *
 * Dates are ISO `YYYY-MM-DD`, matching how Postgres `date` arrives over the wire.
 */
export function densifyDaily(
  entries: readonly { date: string; value: number }[],
  start: string,
  end: string,
): number[] {
  const byDate = new Map<string, number>();
  for (const entry of entries) {
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + entry.value);
  }

  const out: number[] = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);

  while (cursor.getTime() <= last.getTime()) {
    out.push(byDate.get(cursor.toISOString().slice(0, 10)) ?? 0);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return out;
}
