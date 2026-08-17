import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import {
  DST_FALL_BACK,
  DST_FALL_BACK_SLOTS,
  DST_SPRING_FORWARD,
  DST_SPRING_FORWARD_SLOTS,
  DST_ZONE,
  FIXTURE_DATE,
  FIXTURE_FIRST_SLOT,
  FIXTURE_ZONE,
  WAKING_END,
  WAKING_START,
} from "@/lib/metrics/__fixtures__/phase-2";
import {
  daySlots,
  inWakingWindow,
  isAligned,
  localLabel,
  slotHours,
  slotIndex,
  SLOT_SECONDS,
  SLOTS_PER_DAY,
} from "@/lib/metrics/slots";

describe("isAligned", () => {
  it("accepts a quarter-hour boundary", () => {
    expect(isAligned("2026-03-10T09:15:00Z")).toBe(true);
  });

  it("rejects a seven-minute offset", () => {
    expect(isAligned("2026-03-10T09:07:00Z")).toBe(false);
  });

  it("rejects sub-minute drift", () => {
    // The failure mode a naive `setMinutes` rounding leaves behind.
    expect(isAligned("2026-03-10T09:15:01Z")).toBe(false);
  });

  it("holds for a half-hour-offset timezone", () => {
    // +05:30 lands local quarter hours on UTC quarter hours. A timezone with a
    // :45 offset (Kathmandu) would not, which is why storage is UTC.
    expect(isAligned("2026-03-10T09:15:00+05:30")).toBe(true);
  });

  it("handles instants before the epoch without a sign error", () => {
    expect(isAligned("1969-12-31T23:45:00Z")).toBe(true);
    expect(isAligned("1969-12-31T23:52:00Z")).toBe(false);
  });
});

describe("daySlots", () => {
  it("returns 96 slots for an ordinary day", () => {
    expect(daySlots(FIXTURE_DATE, FIXTURE_ZONE)).toHaveLength(SLOTS_PER_DAY);
  });

  it("starts at local midnight projected onto UTC", () => {
    // Getting this wrong shifts every slot in the app by five and a half hours.
    expect(daySlots(FIXTURE_DATE, FIXTURE_ZONE)[0]).toBe(FIXTURE_FIRST_SLOT);
  });

  it("emits 92 slots on a spring-forward day", () => {
    // The day really is 23 hours long. Emitting 96 would invent an hour that
    // never happened and inflate the coverage denominator with it.
    expect(daySlots(DST_SPRING_FORWARD, DST_ZONE)).toHaveLength(
      DST_SPRING_FORWARD_SLOTS,
    );
  });

  it("emits 100 slots on a fall-back day", () => {
    expect(daySlots(DST_FALL_BACK, DST_ZONE)).toHaveLength(DST_FALL_BACK_SLOTS);
  });

  it("keeps every slot 900-second aligned across both transitions", () => {
    // The invariant the database enforces as a check constraint. Real DST
    // offsets are whole quarter hours, so it survives the jump.
    for (const date of [DST_SPRING_FORWARD, DST_FALL_BACK]) {
      for (const slot of daySlots(date, DST_ZONE)) {
        expect(isAligned(slot)).toBe(true);
      }
    }
  });

  it("steps by an absolute 15 minutes, not by wall clock", () => {
    const slots = daySlots(DST_SPRING_FORWARD, DST_ZONE);
    for (let i = 1; i < slots.length; i += 1) {
      const gap =
        DateTime.fromISO(slots[i]).toSeconds() -
        DateTime.fromISO(slots[i - 1]).toSeconds();
      expect(gap).toBe(SLOT_SECONDS);
    }
  });

  it("skips the wall-clock hour that does not exist", () => {
    // 02:00–02:59 local never happens on 2026-03-08 in New York.
    const locals = daySlots(DST_SPRING_FORWARD, DST_ZONE).map((s) =>
      localLabel(s, DST_ZONE),
    );
    expect(locals).toContain("01:45");
    expect(locals).toContain("03:00");
    expect(locals.filter((l) => l.startsWith("02:"))).toHaveLength(0);
  });

  it("emits the repeated wall-clock hour twice", () => {
    // 01:00–01:59 local happens twice on 2026-11-01, at two distinct instants.
    const locals = daySlots(DST_FALL_BACK, DST_ZONE).map((s) =>
      localLabel(s, DST_ZONE),
    );
    expect(locals.filter((l) => l === "01:30")).toHaveLength(2);
  });

  it("produces no duplicate instants on the repeated hour", () => {
    const slots = daySlots(DST_FALL_BACK, DST_ZONE);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it("rejects an unusable timezone rather than silently using the system one", () => {
    expect(() => daySlots(FIXTURE_DATE, "Mars/Olympus_Mons")).toThrow(RangeError);
  });
});

describe("inWakingWindow", () => {
  it("excludes the closing boundary", () => {
    // Half-open, so a 23:00 end excludes the 23:00 slot itself. Including it
    // would put 65 slots in a 16-hour window.
    expect(inWakingWindow("22:45", WAKING_START, WAKING_END)).toBe(true);
    expect(inWakingWindow("23:00", WAKING_START, WAKING_END)).toBe(false);
  });

  it("includes the opening boundary", () => {
    expect(inWakingWindow("07:00", WAKING_START, WAKING_END)).toBe(true);
    expect(inWakingWindow("06:45", WAKING_START, WAKING_END)).toBe(false);
  });

  it("accepts the HH:mm:ss form Postgres returns for a time column", () => {
    expect(inWakingWindow("07:00:00", WAKING_START, WAKING_END)).toBe(true);
  });

  it("counts 64 slots in the default window", () => {
    const inWindow = daySlots(FIXTURE_DATE, FIXTURE_ZONE).filter((slot) =>
      inWakingWindow(localLabel(slot, FIXTURE_ZONE), WAKING_START, WAKING_END),
    );
    // 16 hours × 4. The denominator of every coverage figure in the app.
    expect(inWindow).toHaveLength(64);
  });
});

describe("slotIndex", () => {
  it("indexes from local midnight", () => {
    expect(slotIndex(FIXTURE_FIRST_SLOT, FIXTURE_DATE, FIXTURE_ZONE)).toBe(0);
    // 09:00 local is nine hours in, which is 36 quarter hours.
    expect(
      slotIndex("2026-03-10T09:00:00+05:30", FIXTURE_DATE, FIXTURE_ZONE),
    ).toBe(36);
  });

  it("returns null outside the day rather than a negative index", () => {
    expect(
      slotIndex("2026-03-09T18:15:00Z", FIXTURE_DATE, FIXTURE_ZONE),
    ).toBeNull();
    expect(
      slotIndex("2026-03-11T00:00:00+05:30", FIXTURE_DATE, FIXTURE_ZONE),
    ).toBeNull();
  });

  it("returns null for an unaligned instant", () => {
    expect(
      slotIndex("2026-03-10T09:07:00+05:30", FIXTURE_DATE, FIXTURE_ZONE),
    ).toBeNull();
  });

  it("round-trips every slot of a fall-back day", () => {
    // The hour that happens twice would collide under a wall-clock index.
    const slots = daySlots(DST_FALL_BACK, DST_ZONE);
    const indices = slots.map((s) => slotIndex(s, DST_FALL_BACK, DST_ZONE));
    expect(indices).toEqual(slots.map((_, i) => i));
  });
});

describe("slotHours", () => {
  it("counts four slots as one hour", () => {
    expect(slotHours(4)).toBe(1);
  });

  it("matches the SQL fixture: eight actual slots is 2.0 hours", () => {
    // The figure supabase/tests/phase-2.sql asserts goal_own_hours returns.
    expect(slotHours(8)).toBe(2);
  });
});
