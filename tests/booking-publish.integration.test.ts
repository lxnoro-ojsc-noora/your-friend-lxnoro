import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../server/app";
import { initializeBookingSchema } from "../server/db/schema";
import type { BookingProjectionV1 } from "../src/domain/bookingProjection";
import { BookingApiError, publishBookingProjection } from "../src/platform/bookingApi";

const servers: Array<{ close: () => Promise<void>; db: Database.Database; endpoint: string }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(({ close }) => close()));
});

async function runningServer() {
  const db = new Database(":memory:");
  initializeBookingSchema(db);
  const app = createServer(db, { developmentAuth: true });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind an IP address");
  const server = { close: () => app.close(), db, endpoint: `http://127.0.0.1:${address.port}/api/owner/booking/busy-intervals` };
  servers.push(server);
  return server;
}

function projection(revision: number, intervals: BookingProjectionV1["intervals"]): BookingProjectionV1 {
  return {
    schemaVersion: 1,
    revision,
    coverageStartUtc: "2026-10-08T00:00:00.000Z",
    coverageEndUtc: "2026-10-09T00:00:00.000Z",
    intervals,
  };
}

const publish = (endpoint: string, value: BookingProjectionV1, fetchImpl?: typeof fetch) => publishBookingProjection(value, {
  developmentOwnerId: "local-owner",
  endpoint,
  fetchImpl,
});

describe("client/server booking projection publish", () => {
  it("publishes a valid projection and persists only its UTC intervals", async () => {
    const { db, endpoint } = await runningServer();
    const result = await publish(endpoint, projection(1, [
      { startUtc: "2026-10-08T08:00:00.000Z", endUtc: "2026-10-08T09:00:00.000Z" },
    ]));

    expect(result).toMatchObject({ revision: 1, intervalCount: 1 });
    expect(db.prepare("SELECT owner_id, start_utc, end_utc, source_revision FROM busy_intervals").all()).toEqual([{
      owner_id: "local-owner", start_utc: "2026-10-08T08:00:00.000Z", end_utc: "2026-10-08T09:00:00.000Z", source_revision: 1,
    }]);
  });

  it("atomically replaces the covered snapshot and removes stale intervals", async () => {
    const { db, endpoint } = await runningServer();
    await publish(endpoint, projection(1, [
      { startUtc: "2026-10-08T08:00:00.000Z", endUtc: "2026-10-08T09:00:00.000Z" },
    ]));
    await publish(endpoint, projection(2, [
      { startUtc: "2026-10-08T10:00:00.000Z", endUtc: "2026-10-08T11:00:00.000Z" },
    ]));

    expect(db.prepare("SELECT start_utc, end_utc FROM busy_intervals WHERE owner_id = ?").all("local-owner")).toEqual([{
      start_utc: "2026-10-08T10:00:00.000Z", end_utc: "2026-10-08T11:00:00.000Z",
    }]);
    expect(db.prepare("SELECT source_revision FROM booking_projection_state WHERE owner_id = ?").get("local-owner")).toEqual({ source_revision: 2 });
  });

  it("rejects overlapping intervals without damaging the previous snapshot", async () => {
    const { db, endpoint } = await runningServer();
    await publish(endpoint, projection(1, [
      { startUtc: "2026-10-08T08:00:00.000Z", endUtc: "2026-10-08T09:00:00.000Z" },
    ]));
    const overlapping = projection(2, [
      { startUtc: "2026-10-08T10:00:00.000Z", endUtc: "2026-10-08T11:00:00.000Z" },
      { startUtc: "2026-10-08T10:30:00.000Z", endUtc: "2026-10-08T11:30:00.000Z" },
    ]);

    await expect(publish(endpoint, overlapping)).rejects.toMatchObject<Partial<BookingApiError>>({ status: 409, code: "overlapping_intervals" });
    expect(db.prepare("SELECT start_utc FROM busy_intervals WHERE owner_id = ?").all("local-owner")).toEqual([{ start_utc: "2026-10-08T08:00:00.000Z" }]);
  });

  it("strips all non-contract/private fields before transmission and storage", async () => {
    const { db, endpoint } = await runningServer();
    let transmitted = "";
    const captureFetch: typeof fetch = async (input, init) => {
      transmitted = String(init?.body ?? "");
      return fetch(input, init);
    };
    const privateProjection = {
      ...projection(1, [{ startUtc: "2026-10-08T08:00:00.000Z", endUtc: "2026-10-08T09:00:00.000Z", title: "private title", activityId: "private-id" } as never]),
      notes: "private note",
      category: "private category",
    } as unknown as BookingProjectionV1;

    await publish(endpoint, privateProjection, captureFetch);
    expect(transmitted).not.toMatch(/private title|private-id|private note|private category|activityId|notes|category/);
    const columns = db.prepare("PRAGMA table_info(busy_intervals)").all() as Array<{ name: string }>;
    expect(columns.map(({ name }) => name)).toEqual(["owner_id", "start_utc", "end_utc", "source_revision", "updated_at"]);
    expect(db.prepare("SELECT * FROM busy_intervals").all()).not.toHaveLength(0);
  });

  it("rejects invalid interval bounds", async () => {
    const { endpoint } = await runningServer();
    await expect(publish(endpoint, projection(1, [
      { startUtc: "2026-10-08T10:00:00.000Z", endUtc: "2026-10-08T09:00:00.000Z" },
    ]))).rejects.toMatchObject<Partial<BookingApiError>>({ status: 400, code: "invalid_projection" });
  });
});
