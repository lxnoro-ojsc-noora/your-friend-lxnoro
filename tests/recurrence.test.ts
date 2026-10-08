import { describe, expect, it } from "vitest";
import type { ActivityOccurrenceOverride, ScheduledActivity } from "../src/domain/model";
import { expandActivities, occurrenceOverrideId } from "../src/domain/recurrence";
import { horizonBounds, activityInstant, localDateKey } from "../src/domain/time";
import { dueActivities } from "../src/domain/reminders";

const activity = (overrides: Partial<ScheduledActivity> = {}): ScheduledActivity => ({
  id: "routine-1", typeId: "work", title: "Work", symbol: "💼", startLocal: "2026-03-06T08:30",
  timeZone: "America/New_York", durationMinutes: 45, status: "scheduled", notes: "private", alertEnabled: true,
  createdAt: "2026-03-01T00:00:00.000Z", recurrence: { frequency: "daily", interval: 1 }, ...overrides,
});

describe("shared routine recurrence", () => {
  it("expands bounded daily recurrence and observes its count limit", () => {
    const instances = expandActivities([activity({ recurrence: { frequency: "daily", interval: 1, count: 3 } })], "2026-03-06", "2026-03-12");
    expect(instances.map(({ startLocal }) => startLocal)).toEqual([
      "2026-03-06T08:30", "2026-03-07T08:30", "2026-03-08T08:30",
    ]);
  });

  it("expands selected weekly days and inclusive end dates", () => {
    const instances = expandActivities([activity({ startLocal: "2026-03-02T08:30", recurrence: { frequency: "weekly", interval: 1, weekdays: [1, 3], untilLocal: "2026-03-11" } })], "2026-03-01", "2026-03-15");
    expect(instances.map(({ startLocal }) => startLocal)).toEqual(["2026-03-02T08:30", "2026-03-04T08:30", "2026-03-09T08:30", "2026-03-11T08:30"]);
  });

  it("handles monthly day clamping and yearly leap-day recurrence boundaries", () => {
    const monthEnds = expandActivities([activity({ startLocal: "2026-01-31T08:30", recurrence: { frequency: "monthly", interval: 1, count: 4 } })], "2026-01-01", "2026-06-01");
    expect(monthEnds.map(({ startLocal }) => startLocal)).toEqual(["2026-01-31T08:30", "2026-02-28T08:30", "2026-03-31T08:30", "2026-04-30T08:30"]);
    const leapYears = expandActivities([activity({ startLocal: "2024-02-29T08:30", recurrence: { frequency: "yearly", interval: 1, count: 3 } })], "2024-01-01", "2028-03-01");
    expect(leapYears.map(({ startLocal }) => startLocal)).toEqual(["2024-02-29T08:30", "2025-02-28T08:30", "2026-02-28T08:30"]);
  });

  it("preserves the activity wall-clock time across a DST transition", () => {
    const instances = expandActivities([activity()], "2026-03-06", "2026-03-10");
    expect(instances.map(({ startLocal }) => startLocal.slice(11))).toEqual(["08:30", "08:30", "08:30", "08:30"]);
    const before = activityInstant(instances[1]!.startLocal, "America/New_York");
    const after = activityInstant(instances[2]!.startLocal, "America/New_York");
    expect(after.getTime() - before.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("maps the same recurrence into every horizon range without copying schedule models", () => {
    const anchor = new Date(2026, 2, 8, 12);
    for (const horizon of ["day", "week", "month", "year", "fiveYears"] as const) {
      const { start, end } = horizonBounds(horizon, anchor);
      const instances = expandActivities([activity()], localDateKey(start), localDateKey(end));
      expect(instances.some(({ startLocal }) => startLocal.startsWith("2026-03-08"))).toBe(true);
    }
  });

  it("completes one occurrence or moves just that occurrence while retaining the series", () => {
    const base = activity({ startLocal: "2026-03-06T08:30" });
    const original = "2026-03-08T08:30";
    const completed: ActivityOccurrenceOverride = { id: occurrenceOverrideId(base.id, original), activityId: base.id, originalStartLocal: original, status: "complete", updatedAt: "2026-03-08T00:00:00Z" };
    const postponed: ActivityOccurrenceOverride = { id: occurrenceOverrideId(base.id, "2026-03-09T08:30"), activityId: base.id, originalStartLocal: "2026-03-09T08:30", status: "postponed", startLocal: "2026-03-09T08:45", updatedAt: "2026-03-09T00:00:00Z" };
    const instances = expandActivities([base], "2026-03-08", "2026-03-11", [completed, postponed]);
    expect(instances.map(({ startLocal }) => startLocal)).toEqual(["2026-03-09T08:45", "2026-03-10T08:30"]);
    expect(base.startLocal).toBe("2026-03-06T08:30");
  });

  it("issues only the latest missed reminder for a recurring activity", () => {
    const missed = expandActivities([activity()], "2026-03-06", "2026-03-10");
    const due = dueActivities(missed, [], activityInstant("2026-03-09T09:00", "America/New_York"));
    expect(due.map(({ startLocal }) => startLocal)).toEqual(["2026-03-09T08:30"]);
  });
});
