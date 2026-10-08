import "fake-indexeddb/auto";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { replaceConfirmedAppointmentSnapshot, getConfirmedAppointmentSnapshot } from "../src/data/confirmedAppointments";
import { LxnoroDatabase } from "../src/data/database";
import { confirmedAppointmentToActivity } from "../src/domain/confirmedAppointment";
import { expandActivities } from "../src/domain/recurrence";
import { activityInstant } from "../src/domain/time";
import { BookingSyncCoordinator } from "../src/platform/bookingSyncCoordinator";
import { fetchConfirmedAppointmentProjections } from "../src/platform/bookingApi";
import { createServer } from "../server/app";
import { initializeBookingSchema } from "../server/db/schema";

const now = new Date("2026-10-08T08:00:00.000Z");
const ownerHeaders = { "x-lxnoro-dev-owner-id": "owner-1" };
const databases: LxnoroDatabase[] = [];
const servers: Array<{ close: () => Promise<void> }> = [];
const coordinators: BookingSyncCoordinator[] = [];

afterEach(async () => {
  coordinators.splice(0).forEach((coordinator) => coordinator.stop());
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(databases.splice(0).map(async (db) => { await db.delete(); db.close(); }));
});

function localDb() {
  const db = new LxnoroDatabase("confirmed-appointments-" + crypto.randomUUID());
  databases.push(db);
  return db;
}

async function setupServer() {
  const db = new Database(":memory:");
  initializeBookingSchema(db);
  const app = createServer(db, { developmentAuth: true, bookingNow: () => now });
  await app.listen({ host: "127.0.0.1", port: 0 });
  servers.push({ close: () => app.close() });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  const base = "http://127.0.0.1:" + address.port;
  const configResponse = await fetch(base + "/api/owner/booking/configuration", {
    method: "PUT",
    headers: { ...ownerHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      enabled: true, allowedDurationsMinutes: [30],
      windows: [{ weekday: 4, startLocal: "09:00", endLocal: "17:00" }],
      minimumNoticeMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, timeZone: "Asia/Yerevan",
    }),
  });
  const { bookingLinkId } = await configResponse.json() as { bookingLinkId: string };
  return { base, linkId: bookingLinkId, database: db };
}

async function submit(base: string, linkId: string, startUtc = "2026-10-08T10:00:00.000Z") {
  return fetch(base + "/api/public/booking/" + linkId + "/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requesterName: "Alex Example", requesterEmail: "alex@example.com", requesterNote: "Private requester note",
      requestedStartUtc: startUtc, requestedEndUtc: new Date(Date.parse(startUtc) + 30 * 60_000).toISOString(), durationMinutes: 30,
    }),
  });
}

async function approve(base: string, requestId: string, decision: "approved" | "rejected") {
  return fetch(base + "/api/owner/booking/requests/" + requestId + "/decision", {
    method: "POST",
    headers: { ...ownerHeaders, "content-type": "application/json" },
    body: JSON.stringify({ decision }),
  });
}

describe("confirmed appointment projection", () => {
  it("projects an approved appointment into the local time matrix using only required fields", async () => {
    const { base, linkId } = await setupServer();
    const created = await submit(base, linkId);
    const { requestId } = await created.json() as { requestId: string };
    expect((await approve(base, requestId, "approved")).status).toBe(200);

    let transmitted = "";
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      transmitted = url;
      return fetch(url.startsWith("http") ? url : base + url, init);
    };
    const projection = await fetchConfirmedAppointmentProjections({ developmentOwnerId: "owner-1", fetchImpl });
    expect(transmitted).toContain("/api/owner/booking/appointments");
    expect(projection).toHaveLength(1);
    expect(Object.keys(projection[0] ?? {}).sort()).toEqual(["durationMinutes", "endUtc", "id", "startUtc", "timeZone"]);
    expect(JSON.stringify(projection)).not.toMatch(/Alex Example|alex@example.com|Private requester note|owner-1|task|title|category/);

    const local = localDb();
    await replaceConfirmedAppointmentSnapshot(projection, local);
    const stored = await getConfirmedAppointmentSnapshot(local);
    const activity = confirmedAppointmentToActivity(stored[0]!, "Shared appointment");
    const matrixItems = expandActivities([activity], "2026-10-08", "2026-10-09");
    expect(matrixItems).toHaveLength(1);
    expect(matrixItems[0]).toMatchObject({
      id: "booking:" + projection[0]!.id,
      title: "Shared appointment",
      symbol: "📅",
      startLocal: "2026-10-08T14:00",
      startUtc: "2026-10-08T10:00:00.000Z",
      timeZone: "Asia/Yerevan",
      durationMinutes: 30,
      alertEnabled: true,
    });
  });

  it("never projects Pending or Rejected requests as appointments", async () => {
    const { base, linkId } = await setupServer();
    const pending = await submit(base, linkId);
    const pendingId = (await pending.json() as { requestId: string }).requestId;
    const pendingSnapshot = await fetch(base + "/api/owner/booking/appointments", { headers: ownerHeaders });
    expect(await pendingSnapshot.json()).toEqual({ appointments: [] });
    expect((await approve(base, pendingId, "rejected")).status).toBe(200);
    const rejectedSnapshot = await fetch(base + "/api/owner/booking/appointments", { headers: ownerHeaders });
    expect(await rejectedSnapshot.json()).toEqual({ appointments: [] });
  });

  it("repeated refresh replaces the snapshot without duplicate local appointments", async () => {
    const db = localDb();
    const appointment = {
      id: "b48c3df4-e84f-4ce1-9050-bac994076580",
      startUtc: "2026-10-08T10:00:00.000Z",
      endUtc: "2026-10-08T10:30:00.000Z",
      durationMinutes: 30,
      timeZone: "Asia/Yerevan",
    };
    await replaceConfirmedAppointmentSnapshot([appointment], db);
    await replaceConfirmedAppointmentSnapshot([appointment], db);
    expect(await db.confirmedBookingAppointments.count()).toBe(1);
    expect(await getConfirmedAppointmentSnapshot(db)).toEqual([appointment]);
  });

  it("preserves exact UTC time through timezone conversion at an ambiguous DST fold", () => {
    const activity = confirmedAppointmentToActivity({
      id: "b48c3df4-e84f-4ce1-9050-bac994076580",
      startUtc: "2026-11-01T06:30:00.000Z",
      endUtc: "2026-11-01T07:30:00.000Z",
      durationMinutes: 60,
      timeZone: "America/New_York",
    });
    expect(activity.startLocal).toBe("2026-11-01T01:30");
    expect(activityInstant(activity.startLocal, activity.timeZone, activity.startUtc).toISOString()).toBe("2026-11-01T06:30:00.000Z");
    expect(expandActivities([activity], "2026-11-01", "2026-11-02")[0]?.startUtc).toBe("2026-11-01T06:30:00.000Z");
  });

  it("refreshes the local appointment projection on coordinator startup and includes it in interval-only sync", async () => {
    const db = localDb();
    const appointment = {
      id: "b48c3df4-e84f-4ce1-9050-bac994076580",
      startUtc: "2026-10-08T10:00:00.000Z",
      endUtc: "2026-10-08T10:30:00.000Z",
      durationMinutes: 30,
      timeZone: "Asia/Yerevan",
    };
    const sent: Array<Record<string, unknown>> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/appointments")) {
        return new Response(JSON.stringify({ appointments: [appointment] }), { status: 200 });
      }
      if (init?.method === "GET") {
        return new Response(JSON.stringify({ ownerId: "owner-1", revision: 0, intervals: [], syncStatus: "synced", updatedAt: null }), { status: 200 });
      }
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      sent.push(body);
      return new Response(JSON.stringify({ revision: body.revision, intervalCount: 1, updatedAt: now.toISOString() }), { status: 200 });
    };
    const coordinator = new BookingSyncCoordinator({
      db, developmentOwnerId: "owner-1", fetchImpl, isOnline: () => true, now: () => now, eventTarget: new EventTarget(),
    });
    coordinators.push(coordinator);
    await coordinator.start();
    expect(await db.confirmedBookingAppointments.count()).toBe(1);
    expect((sent[0]?.intervals as Array<Record<string, string>>)[0]).toEqual({
      startUtc: "2026-10-08T10:00:00.000Z",
      endUtc: "2026-10-08T10:30:00.000Z",
    });
    expect(JSON.stringify(sent[0])).not.toMatch(/appointment-id|title|name|email|notes|category/);
  });
});
