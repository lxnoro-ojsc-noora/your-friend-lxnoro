import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { getBookingSyncSnapshot } from "../src/data/bookingSync";
import { LxnoroDatabase } from "../src/data/database";
import type { ScheduledActivity } from "../src/domain/model";
import { BookingSyncCoordinator } from "../src/platform/bookingSyncCoordinator";

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
});
