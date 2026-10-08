import { describe, expect, it } from "vitest";
import type { ScheduledActivity } from "../src/domain/model";
import { assertProjectionRevisionAdvances, createBookingProjectionV1 } from "../src/domain/bookingProjection";

const scheduled = (overrides: Partial<ScheduledActivity> = {}): ScheduledActivity => ({
  id: "private-task-id", typeId: "private-category-id", title: "Private title", symbol: "🔒",
  startLocal: "2026-10-08T08:00", timeZone: "Asia/Yerevan", durationMinutes: 60,
  status: "scheduled", notes: "Private note", alertEnabled: true, createdAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

const window = {
  start: new Date("2026-10-08T00:00:00.000Z"),
  end: new Date("2026-10-09T00:00:00.000Z"),
};

describe("versioned interval-only booking projection", () => {
  it("projects scheduled activities to UTC instants using their stored time zone", () => {
    const projection = createBookingProjectionV1([
      scheduled(),
      scheduled({ id: "complete", status: "complete", startLocal: "2026-10-08T10:00" }),
      scheduled({ id: "outside", startLocal: "2026-10-09T08:00" }),
    ], 1, window);

    expect(projection).toEqual({
      schemaVersion: 1,
      revision: 1,
      coverageStartUtc: "2026-10-08T00:00:00.000Z",
      coverageEndUtc: "2026-10-09T00:00:00.000Z",
      intervals: [{ startUtc: "2026-10-08T04:00:00.000Z", endUtc: "2026-10-08T05:00:00.000Z" }],
    });
  });

  it("coalesces overlapping and adjacent intervals into one busy span", () => {
    const projection = createBookingProjectionV1([
      scheduled({ id: "first", startLocal: "2026-10-08T08:00", durationMinutes: 60 }),
      scheduled({ id: "adjacent", startLocal: "2026-10-08T09:00", durationMinutes: 30 }),
      scheduled({ id: "overlap", startLocal: "2026-10-08T08:30", durationMinutes: 90 }),
    ], 1, window);

    expect(projection.intervals).toEqual([{ startUtc: "2026-10-08T04:00:00.000Z", endUtc: "2026-10-08T06:00:00.000Z" }]);
  });

  it("serializes no private activity identity or content", () => {
    const projection = createBookingProjectionV1([scheduled()], 4, window);
    const serialized = JSON.stringify(projection);

    expect(Object.keys(projection).sort()).toEqual(["coverageEndUtc", "coverageStartUtc", "intervals", "revision", "schemaVersion"]);
    expect(Object.keys(projection.intervals[0] ?? {}).sort()).toEqual(["endUtc", "startUtc"]);
    for (const privateValue of ["private-task-id", "private-category-id", "Private title", "Private note", "🔒"]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("creates a higher-revision replacement snapshot, including an empty snapshot that clears the covered window", () => {
    const first = createBookingProjectionV1([scheduled()], 1, window);
    const replacement = createBookingProjectionV1([], 2, window);

    expect(first.intervals).toHaveLength(1);
    expect(replacement).toMatchObject({ schemaVersion: 1, revision: 2, intervals: [] });
    expect(replacement.coverageStartUtc).toBe(first.coverageStartUtc);
    expect(replacement.coverageEndUtc).toBe(first.coverageEndUtc);
    expect(() => assertProjectionRevisionAdvances(replacement, first.revision)).not.toThrow();
    expect(() => assertProjectionRevisionAdvances(first, replacement.revision)).toThrow(RangeError);
  });
});
