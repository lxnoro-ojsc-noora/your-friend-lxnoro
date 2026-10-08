import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { acceptNewerServerBookingSnapshot, getBookingSyncSnapshot, markBookingSnapshotSynced, replacePendingBookingSnapshot } from "../src/data/bookingSync";
import { LxnoroDatabase } from "../src/data/database";
import type { ScheduledActivity } from "../src/domain/model";
import { BookingSyncCoordinator } from "../src/platform/bookingSyncCoordinator";
import { BookingApiError, fetchBookingProjectionSnapshot } from "../src/platform/bookingApi";

const databases: LxnoroDatabase[] = [];
const coordinators: BookingSyncCoordinator[] = [];
afterEach(async () => {
  coordinators.splice(0).forEach((coordinator) => coordinator.stop());
  await Promise.all(databases.splice(0).map(async (db) => { await db.delete(); db.close(); }));
});

const activity: ScheduledActivity = {
  id: "private-activity-id", typeId: "private-category", title: "Private title", symbol: "🔒",
  startLocal: "2026-10-08T08:00", timeZone: "Asia/Yerevan", durationMinutes: 60,
  status: "scheduled", notes: "Private notes", alertEnabled: true, createdAt: "2026-10-01T00:00:00.000Z",
};

function createDb(): LxnoroDatabase {
  const db = new LxnoroDatabase(`booking-coordinator-${crypto.randomUUID()}`);
  databases.push(db);
  return db;
}

function successFetch(captured: string[]): typeof fetch {
  return async (_input, init) => {
    if (init?.method === "GET") {
      return new Response(JSON.stringify({ ownerId: "local-owner", revision: 0, intervals: [], syncStatus: "synced", updatedAt: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    captured.push(String(init?.body ?? ""));
    const request = JSON.parse(String(init?.body ?? "{}")) as { revision?: number; intervals?: unknown[] };
    return new Response(JSON.stringify({ revision: request.revision, intervalCount: request.intervals?.length ?? 0, updatedAt: "2026-10-08T00:00:00.000Z" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function coordinator(db: LxnoroDatabase, options: {
  eventTarget?: EventTarget;
  online?: () => boolean;
  fetchImpl?: typeof fetch;
} = {}) {
  const instance = new BookingSyncCoordinator({
    db,
    developmentOwnerId: "local-owner",
    eventTarget: options.eventTarget ?? new EventTarget(),
    isOnline: options.online ?? (() => true),
    fetchImpl: options.fetchImpl,
    now: () => new Date("2026-10-08T12:00:00.000Z"),
  });
  coordinators.push(instance);
  return instance;
}

describe("booking sync coordinator", () => {
  it("publishes a new snapshot after a local projection change", async () => {
    const db = createDb();
    await db.activities.put(activity);
    const transmitted: string[] = [];
    await coordinator(db, { fetchImpl: successFetch(transmitted) }).projectionChanged();

    expect(transmitted).toHaveLength(1);
    expect(JSON.parse(transmitted[0] ?? "{}")).toMatchObject({ schemaVersion: 1, revision: 1, intervals: [{
      startUtc: "2026-10-08T04:00:00.000Z", endUtc: "2026-10-08T05:00:00.000Z",
    }] });
    await expect(getBookingSyncSnapshot(db)).resolves.toMatchObject({ revision: 1, syncStatus: "synced" });
  });

  it("publishes an updated snapshot when connectivity returns", async () => {
    const db = createDb();
    await db.activities.put(activity);
    const events = new EventTarget();
    const transmitted: string[] = [];
    let online = false;
    const instance = coordinator(db, { eventTarget: events, online: () => online, fetchImpl: successFetch(transmitted) });
    instance.start();
    await instance.projectionChanged();
    expect(transmitted).toHaveLength(0);

    online = true;
    events.dispatchEvent(new Event("online"));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(transmitted).toHaveLength(1);
    await expect(getBookingSyncSnapshot(db)).resolves.toMatchObject({ revision: 3, syncStatus: "synced" });
  });

  it("keeps local activities intact and the snapshot pending after server failure", async () => {
    const db = createDb();
    await db.activities.put(activity);
    const failingFetch: typeof fetch = async () => { throw new TypeError("network unavailable"); };

    await expect(coordinator(db, { fetchImpl: failingFetch }).projectionChanged()).resolves.toBeUndefined();
    await expect(db.activities.get(activity.id)).resolves.toEqual(activity);
    await expect(getBookingSyncSnapshot(db)).resolves.toMatchObject({ revision: 1, syncStatus: "pending" });
  });

  it("sends only privacy-safe busy interval projection fields", async () => {
    const db = createDb();
    await db.activities.put(activity);
    const transmitted: string[] = [];
    await coordinator(db, { fetchImpl: successFetch(transmitted) }).projectionChanged();

    const serialized = transmitted[0] ?? "";
    const payload = JSON.parse(serialized) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["coverageEndUtc", "coverageStartUtc", "intervals", "revision", "schemaVersion"]);
    const intervals = payload.intervals as Array<Record<string, unknown>>;
    expect(Object.keys(intervals[0] ?? {}).sort()).toEqual(["endUtc", "startUtc"]);
    expect(serialized).not.toMatch(/private-activity-id|private-category|Private title|Private notes|🔒/);
  });

  it("accepts a strictly newer server snapshot into the interval-only outbox", async () => {
    const db = createDb();
    await replacePendingBookingSnapshot({
      schemaVersion: 1, revision: 2, coverageStartUtc: "2026-10-08T00:00:00.000Z", coverageEndUtc: "2026-10-09T00:00:00.000Z",
      intervals: [{ startUtc: "2026-10-08T04:00:00.000Z", endUtc: "2026-10-08T05:00:00.000Z" }],
    }, db);
    await markBookingSnapshotSynced(2, db);
    const serverSnapshot = {
      ownerId: "local-owner", revision: 3,
      intervals: [{ startUtc: "2026-10-08T06:00:00.000Z", endUtc: "2026-10-08T07:00:00.000Z" }],
      syncStatus: "synced" as const, updatedAt: "2026-10-08T01:00:00.000Z",
    };

    await expect(acceptNewerServerBookingSnapshot(serverSnapshot, db)).resolves.toBe(true);
    await expect(getBookingSyncSnapshot(db)).resolves.toMatchObject({ revision: 3, syncStatus: "synced", intervals: serverSnapshot.intervals });
  });

  it("ignores a stale server snapshot and protects a pending local projection", async () => {
    const db = createDb();
    const local = {
      schemaVersion: 1 as const, revision: 4, coverageStartUtc: "2026-10-08T00:00:00.000Z", coverageEndUtc: "2026-10-09T00:00:00.000Z",
      intervals: [{ startUtc: "2026-10-08T04:00:00.000Z", endUtc: "2026-10-08T05:00:00.000Z" }],
    };
    await replacePendingBookingSnapshot(local, db);
    await markBookingSnapshotSynced(4, db);
    const older = { ownerId: "local-owner", revision: 3, intervals: [], syncStatus: "synced" as const, updatedAt: null };

    await expect(acceptNewerServerBookingSnapshot(older, db)).resolves.toBe(false);
    await expect(getBookingSyncSnapshot(db)).resolves.toEqual({ id: "current", revision: 4, intervals: local.intervals, syncStatus: "synced" });

    const newerLocal = { ...local, revision: 5, intervals: [{ startUtc: "2026-10-08T08:00:00.000Z", endUtc: "2026-10-08T09:00:00.000Z" }] };
    await replacePendingBookingSnapshot(newerLocal, db);
    await expect(acceptNewerServerBookingSnapshot({ ...older, revision: 10 }, db)).resolves.toBe(false);
    await expect(getBookingSyncSnapshot(db)).resolves.toEqual({ id: "current", revision: 5, intervals: newerLocal.intervals, syncStatus: "pending" });
  });

  it("fetches and accepts a newer owner snapshot on startup without publishing over it", async () => {
    const db = createDb();
    await replacePendingBookingSnapshot({
      schemaVersion: 1, revision: 2, coverageStartUtc: "2026-10-08T00:00:00.000Z", coverageEndUtc: "2026-10-09T00:00:00.000Z", intervals: [],
    }, db);
    await markBookingSnapshotSynced(2, db);
    let putCount = 0;
    const fetchImpl: typeof fetch = async (_input, init) => {
      if (init?.method === "GET") return new Response(JSON.stringify({
        ownerId: "local-owner", revision: 3,
        intervals: [{ startUtc: "2026-10-08T06:00:00.000Z", endUtc: "2026-10-08T07:00:00.000Z" }],
        syncStatus: "synced", updatedAt: "2026-10-08T01:00:00.000Z",
      }), { status: 200, headers: { "content-type": "application/json" } });
      putCount += 1;
      throw new Error("unexpected publish");
    };

    await coordinator(db, { fetchImpl }).start();
    expect(putCount).toBe(0);
    await expect(getBookingSyncSnapshot(db)).resolves.toMatchObject({ revision: 3, syncStatus: "synced" });
  });

  it("publishes existing local activities when the server has no projection yet", async () => {
    const db = createDb();
    await db.activities.put(activity);
    const transmitted: string[] = [];

    await coordinator(db, { fetchImpl: successFetch(transmitted) }).start();
    expect(transmitted).toHaveLength(1);
    expect(JSON.parse(transmitted[0] ?? "{}")).toMatchObject({ revision: 1, intervals: [{
      startUtc: "2026-10-08T04:00:00.000Z", endUtc: "2026-10-08T05:00:00.000Z",
    }] });
  });

  it("rejects malformed or privacy-violating server snapshot fields", async () => {
    const badFetch: typeof fetch = async () => new Response(JSON.stringify({
      ownerId: "local-owner", revision: 5,
      intervals: [{ startUtc: "2026-10-08T04:00:00.000Z", endUtc: "2026-10-08T05:00:00.000Z", notes: "private" }],
      syncStatus: "synced", updatedAt: null,
    }), { status: 200, headers: { "content-type": "application/json" } });

    await expect(fetchBookingProjectionSnapshot({ developmentOwnerId: "local-owner", fetchImpl: badFetch }))
      .rejects.toMatchObject<Partial<BookingApiError>>({ code: "invalid_snapshot" });
  });

  it("leaves local planning and the pending projection intact when server refresh fails", async () => {
    const db = createDb();
    await db.activities.put(activity);
    const failingFetch: typeof fetch = async () => { throw new TypeError("offline"); };
    const instance = coordinator(db, { fetchImpl: failingFetch });

    await expect(instance.start()).resolves.toBeUndefined();
    await expect(db.activities.get(activity.id)).resolves.toEqual(activity);
    await expect(getBookingSyncSnapshot(db)).resolves.toMatchObject({ revision: 1, syncStatus: "pending" });
  });
});
