import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { LxnoroDatabase, initializeDatabase } from "../src/data/database";
import { starterDefinitions } from "../src/data/catalog";
import { horizonBounds, isInRange, localDateKey, localDateTime, nearestQuarterDate, nearestQuarterHour } from "../src/domain/time";
import { formatStarterTitle, translate } from "../src/i18n/messages";

const databases: LxnoroDatabase[] = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (db) => { await db.delete(); db.close(); }));
});

describe("local-first foundation", () => {
  it("initializes preferences and visible starter activity foundations without scheduling them", async () => {
    const db = new LxnoroDatabase(`test-${crypto.randomUUID()}`);
    databases.push(db);
    await initializeDatabase(db);
    expect(await db.activityTypes.count()).toBe(starterDefinitions.length);
    expect(await db.activities.count()).toBe(0);
    expect(await db.preferences.get("main")).toMatchObject({ id: "main", startersInitialized: true });
    expect(starterDefinitions.find(({ key }) => key === "breakfast")).toMatchObject({ symbol: "🍳", messageKey: "starterBreakfast" });
  });

  it("persists a scheduled activity locally and reads it after reopening the database", async () => {
    const name = `test-${crypto.randomUUID()}`;
    const first = new LxnoroDatabase(name);
    databases.push(first);
    await initializeDatabase(first);
    const activity = {
      id: "activity-1", typeId: "starter-breakfast", title: "Breakfast", symbol: "🍳",
      startLocal: "2026-10-08T08:15", timeZone: "Asia/Yerevan", durationMinutes: 30,
      status: "scheduled" as const, notes: "", alertEnabled: true, createdAt: "2026-10-08T00:00:00.000Z",
    };
    await first.activities.put(activity);
    first.close();
    const reopened = new LxnoroDatabase(name);
    databases.push(reopened);
    expect(await reopened.activities.get("activity-1")).toEqual(activity);
  });

  it("maps a date consistently into day, week, month, year, and five-year ranges", () => {
    const anchor = new Date(2026, 9, 8, 12);
    for (const horizon of ["day", "week", "month", "year", "fiveYears"] as const) {
      const { start, end } = horizonBounds(horizon, anchor);
      expect(start.getTime()).toBeLessThanOrEqual(anchor.getTime());
      expect(end.getTime()).toBeGreaterThan(anchor.getTime());
      if (horizon === "day") expect(end.getDate() - start.getDate()).toBe(1);
      if (horizon === "week") expect((end.getTime() - start.getTime()) / 86_400_000).toBe(7);
      if (horizon === "month") expect(end.getMonth()).toBe(start.getMonth() + 1);
      if (horizon === "year") expect(end.getFullYear() - start.getFullYear()).toBe(1);
      if (horizon === "fiveYears") expect(end.getFullYear() - start.getFullYear()).toBe(5);
    }
  });

  it("uses local calendar keys and keeps horizon membership end-exclusive", () => {
    const anchor = new Date(2026, 9, 8, 12);
    const bounds = horizonBounds("day", anchor);
    expect(localDateKey(anchor)).toBe("2026-10-08");
    expect(isInRange("2026-10-08T23:59", bounds.start, bounds.end)).toBe(true);
    expect(isInRange("2026-10-09T00:00", bounds.start, bounds.end)).toBe(false);
    expect(localDateTime("2026-10-08", "08:30").getHours()).toBe(8);
  });

  it("converts an activity using its stored IANA zone instead of the browser zone", () => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const activityTimeZone = browserTimeZone === "Asia/Tokyo" ? "America/Los_Angeles" : "Asia/Tokyo";
    const expectedInstant = activityTimeZone === "Asia/Tokyo" ? "2026-10-08T00:00:00.000Z" : "2026-10-08T16:00:00.000Z";
    expect(localDateTime("2026-10-08", "09:00", activityTimeZone).toISOString()).toBe(expectedInstant);
  });

  it("converts across DST transitions and makes ambiguous fall-back time behavior explicit", () => {
    const beforeSpringJump = localDateTime("2026-03-08", "01:30", "America/New_York");
    const afterSpringJump = localDateTime("2026-03-08", "03:30", "America/New_York");
    expect(beforeSpringJump.toISOString()).toBe("2026-03-08T06:30:00.000Z");
    expect(afterSpringJump.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(afterSpringJump.getTime() - beforeSpringJump.getTime()).toBe(60 * 60 * 1000);

    const ambiguousEarlier = localDateTime("2026-11-01", "01:30", "America/New_York");
    const ambiguousLater = localDateTime("2026-11-01", "01:30", "America/New_York", "later");
    expect(ambiguousEarlier.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(ambiguousLater.toISOString()).toBe("2026-11-01T06:30:00.000Z");

    const skippedSpringTime = localDateTime("2026-03-08", "02:30", "America/New_York");
    expect(skippedSpringTime.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("rounds a local time forward to a 15-minute boundary", () => {
    expect(nearestQuarterHour(new Date(2026, 9, 8, 8, 1))).toBe("08:15");
    expect(nearestQuarterHour(new Date(2026, 9, 8, 8, 15))).toBe("08:15");
    const afterMidnight = nearestQuarterDate(new Date(2026, 9, 8, 23, 59));
    expect(localDateKey(afterMidnight)).toBe("2026-10-09");
    expect(nearestQuarterHour(afterMidnight)).toBe("00:00");
  });

  it("provides English and Arabic interface content from the centralized catalog", () => {
    expect(translate("en", "starterBreakfast")).toBe("Breakfast");
    expect(translate("ar", "starterBreakfast")).toBe("الإفطار");
    expect(formatStarterTitle("ar", "family")).toBe("وقت العائلة");
  });
});
