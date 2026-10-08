import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { replacePendingBookingSnapshot, getBookingSyncSnapshot, markBookingSnapshotSynced } from "../src/data/bookingSync";
import { LxnoroDatabase } from "../src/data/database";
import { createBookingProjectionV1 } from "../src/domain/bookingProjection";
import type { ScheduledActivity } from "../src/domain/model";

const databases: LxnoroDatabase[] = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (db) => { await db.delete(); db.close(); }));
});

const makeDb = () => {
  const db = new LxnoroDatabase(`booking-sync-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
};

const activity: ScheduledActivity = {
  id: "private-id", typeId: "private-category", title: "Private appointment", symbol: "🔒",
  startLocal: "2026-10-08T08:00", timeZone: "Asia/Yerevan", durationMinutes: 60,
  status: "scheduled", notes: "Sensitive details", alertEnabled: true, createdAt: "2026-10-01T00:00:00.000Z",
};

const projection = (revision: number, activities: ScheduledActivity[] = [activity]) => createBookingProjectionV1(
  activities,
  revision,
  { start: new Date("2026-10-08T00:00:00.000Z"), end: new Date("2026-10-09T00:00:00.000Z") },
);

describe("local booking sync outbox", () => {
  it("persists the pending interval snapshot across database reopen", async () => {
    const db = makeDb();
    const name = db.name;
    const queued = await replacePendingBookingSnapshot(projection(1), db);
    db.close();
    const reopened = new LxnoroDatabase(name);
    databases.push(reopened);

    await expect(getBookingSyncSnapshot(reopened)).resolves.toEqual(queued);
  });

  it("replaces the entire snapshot so deleted activities leave no stale intervals", async () => {
    const db = makeDb();
    await replacePendingBookingSnapshot(projection(1), db);

    const replacement = await replacePendingBookingSnapshot(projection(2, []), db);
    expect(replacement).toMatchObject({ revision: 2, intervals: [], syncStatus: "pending" });
    await expect(getBookingSyncSnapshot(db)).resolves.toEqual(replacement);
  });

  it("persists only interval boundaries, revision, sync status, and the fixed singleton key", async () => {
    const db = makeDb();
    const input = {
      ...projection(1),
      privateField: "private payload must not be persisted",
      intervals: [{ ...projection(1).intervals[0], title: "hidden activity title", activityId: "private-id" }],
    } as unknown as ReturnType<typeof projection>;

    await replacePendingBookingSnapshot(input, db);
    const stored = await getBookingSyncSnapshot(db);
    const serialized = JSON.stringify(stored);
    expect(Object.keys(stored ?? {}).sort()).toEqual(["id", "intervals", "revision", "syncStatus"]);
    expect(Object.keys(stored?.intervals[0] ?? {}).sort()).toEqual(["endUtc", "startUtc"]);
    for (const secret of ["private payload", "hidden activity title", "private-id", "Sensitive details", "Private appointment"]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("requires advancing revisions and ignores acknowledgements for replaced snapshots", async () => {
    const db = makeDb();
    await replacePendingBookingSnapshot(projection(1), db);
    await expect(replacePendingBookingSnapshot(projection(1, []), db)).rejects.toThrow(RangeError);
    await replacePendingBookingSnapshot(projection(2, []), db);

    await expect(markBookingSnapshotSynced(1, db)).resolves.toBe(false);
    await expect(getBookingSyncSnapshot(db)).resolves.toMatchObject({ revision: 2, syncStatus: "pending" });
    await expect(markBookingSnapshotSynced(2, db)).resolves.toBe(true);
    await expect(getBookingSyncSnapshot(db)).resolves.toMatchObject({ revision: 2, syncStatus: "synced" });
  });
});
