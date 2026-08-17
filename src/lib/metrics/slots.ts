/**
 * Slot arithmetic: projecting a local day onto the UTC 15-minute grid.
 *
 * SQL counterpart: `public.get_day_grid`. That is authoritative — the dashboard
 * and the Phase 5 nudge engine both read it. This mirror exists so the boundary
 * cases can be tested against fixtures checkable by hand, and so the client can
 * label and index a grid it already holds without another round trip.
 *
 * The one property everything downstream depends on: `slot_start` is UTC and
 * aligned to a 900-second boundary. That is a check constraint on `time_slots`,
 * not a convention, because every metric here counts rows and multiplies by
 * 0.25 — a slot of some other length would corrupt every hour figure silently.
 */

import { DateTime } from "luxon";

export const SLOT_MINUTES = 15;
export const SLOT_SECONDS = SLOT_MINUTES * 60;
export const SLOT_MS = SLOT_SECONDS * 1000;

/** Hours per slot. The only place this quarter is written in TypeScript. */
export const SLOT_HOURS = 0.25;

/** Slots in a day that has no DST transition. Not a guarantee — see `daySlots`. */
export const SLOTS_PER_DAY = 96;

/** True when an instant sits exactly on a 900-second boundary. */
export function isAligned(instant: string | DateTime): boolean {
  const dt =
    typeof instant === "string" ? DateTime.fromISO(instant) : instant;
  if (!dt.isValid) return false;
  // JS keeps the sign of the dividend, and epochs before 1970 are negative.
  const seconds = Math.trunc(dt.toSeconds());
  return (((seconds % SLOT_SECONDS) + SLOT_SECONDS) % SLOT_SECONDS) === 0;
}

/**
 * Every slot of one local day, as UTC instants, oldest first.
 *
 * NOT ALWAYS 96. A day containing a DST transition is genuinely 23 or 25 hours
 * long, so it is 92 or 100 slots. Hard-coding 96 from local midnight would
 * silently drop or repeat an hour, and the resulting coverage denominator would
 * be wrong on exactly two days a year — the kind of error that is never noticed
 * and never trusted once found.
 *
 * Alignment survives the jump: every real DST offset is a whole number of
 * quarter hours, and the walk steps by an absolute 15 minutes rather than by
 * wall-clock arithmetic.
 */
export function daySlots(date: string, timezone: string): string[] {
  const start = DateTime.fromISO(date, { zone: timezone }).startOf("day");
  if (!start.isValid) {
    throw new RangeError(`Invalid date ${date} or timezone ${timezone}`);
  }

  const end = start.plus({ days: 1 }).startOf("day");
  const count = Math.round((end.toMillis() - start.toMillis()) / SLOT_MS);

  const slots: string[] = [];
  for (let i = 0; i < count; i += 1) {
    slots.push(
      DateTime.fromMillis(start.toMillis() + i * SLOT_MS, { zone: "utc" })
        .toISO({ suppressMilliseconds: true })!,
    );
  }
  return slots;
}

/** `HH:mm` in the user's timezone. Display only — never storage. */
export function localLabel(instant: string, timezone: string): string {
  return DateTime.fromISO(instant, { zone: timezone }).toFormat("HH:mm");
}

/**
 * Whether a slot falls inside the waking window, which is the denominator of
 * coverage. Times are local `HH:mm` or `HH:mm:ss`; the window is half-open, so a
 * window ending at 23:00 excludes the 23:00 slot itself.
 *
 * Overnight windows are unsupported deliberately — `waking_start < waking_end`
 * is a check constraint on `profiles`. See docs/SCHEMA.md.
 */
export function inWakingWindow(
  localTime: string,
  wakingStart: string,
  wakingEnd: string,
): boolean {
  const minutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":");
    return Number(h) * 60 + Number(m);
  };
  const at = minutes(localTime);
  return at >= minutes(wakingStart) && at < minutes(wakingEnd);
}

/** Hours from a slot count. `4` slots is one hour. */
export function slotHours(count: number): number {
  return count * SLOT_HOURS;
}

/**
 * The index of an instant within a local day, or null if it falls outside.
 *
 * Computed from the day's own start rather than from the wall clock, so it stays
 * correct on either side of a DST transition.
 */
export function slotIndex(
  instant: string,
  date: string,
  timezone: string,
): number | null {
  const start = DateTime.fromISO(date, { zone: timezone }).startOf("day");
  const end = start.plus({ days: 1 }).startOf("day");
  const at = DateTime.fromISO(instant);

  if (!start.isValid || !at.isValid) return null;
  if (at.toMillis() < start.toMillis() || at.toMillis() >= end.toMillis()) {
    return null;
  }

  const offset = at.toMillis() - start.toMillis();
  return offset % SLOT_MS === 0 ? offset / SLOT_MS : null;
}
