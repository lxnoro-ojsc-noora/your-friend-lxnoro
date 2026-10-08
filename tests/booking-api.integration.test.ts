import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../server/app";
import { initializeBookingSchema } from "../server/db/schema";

const servers: Array<{ close: () => Promise<void>; db: Database.Database; base: string }> = [];
const now = new Date("2026-10-08T08:00:00.000Z");
const ownerHeaders = { "x-lxnoro-dev-owner-id": "owner-1" };

async function runningServer() {
  const db = new Database(":memory:");
  initializeBookingSchema(db);
  const app = createServer(db, { developmentAuth: true, bookingNow: () => now });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind an IP address");
  const server = { close: () => app.close(), db, base: "http://127.0.0.1:" + address.port };
  servers.push(server);
  return server;
}

function config() {
  return {
    enabled: true,
    allowedDurationsMinutes: [30, 60],
    windows: [{ weekday: 4, startLocal: "09:00", endLocal: "17:00" }],
    minimumNoticeMinutes: 60,
    maximumAdvanceMinutes: 60 * 24 * 30,
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 10,
    timeZone: "Asia/Yerevan",
    expiresAtUtc: "2026-12-31T00:00:00.000Z",
  };
}

async function configure(base: string, body: unknown = config()) {
  const response = await fetch(base + "/api/owner/booking/configuration", {
    method: "PUT",
    headers: { ...ownerHeaders, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, result: await response.json() as Record<string, unknown> };
}

function requestBody(startUtc = "2026-10-08T10:00:00.000Z", endUtc = "2026-10-08T10:30:00.000Z") {
  return {
    requesterName: "Alex Example",
    requesterEmail: "alex@example.com",
    requesterNote: "Short appointment note",
    requestedStartUtc: startUtc,
    requestedEndUtc: endUtc,
    durationMinutes: (Date.parse(endUtc) - Date.parse(startUtc)) / 60_000,
  };
}

async function submit(base: string, linkId: string, body: unknown) {
  return fetch(base + "/api/public/booking/" + linkId + "/requests", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(({ close }) => close()));
});

describe("Slice 6 booking API integration", () => {
  it("enforces the development owner auth boundary and creates opaque links", async () => {
    const { base } = await runningServer();
    const unauthenticated = await fetch(base + "/api/owner/booking/configuration", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(config()),
    });
    expect(unauthenticated.status).toBe(401);
    const { response, result } = await configure(base);
    expect(response.status).toBe(200);
    expect(result.bookingLinkId).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(result).not.toHaveProperty("ownerId");
  });

  it("returns availability only, with no private schedule or conflict details", async () => {
    const { base, db } = await runningServer();
    const { result } = await configure(base);
    const linkId = result.bookingLinkId as string;
    db.prepare("INSERT INTO busy_intervals (owner_id, start_utc, end_utc, source_revision, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("owner-1", "2026-10-08T10:00:00.000Z", "2026-10-08T10:30:00.000Z", 1, now.toISOString());
    const response = await fetch(base + "/api/public/booking/" + linkId +
      "/availability?fromUtc=2026-10-08T08%3A00%3A00.000Z&toUtc=2026-10-08T12%3A00%3A00.000Z");
    const payload = await response.json() as { timeZone: string; availableSlots: Array<Record<string, unknown>> };
    expect(response.status).toBe(200);
    expect(Object.keys(payload).sort()).toEqual(["availableSlots", "timeZone"]);
    expect(payload.timeZone).toBe("Asia/Yerevan");
    expect(payload.availableSlots.every((slot) => Object.keys(slot).sort().join(",") === "durationMinutes,endUtc,startUtc")).toBe(true);
    expect(payload.availableSlots).not.toContainEqual(expect.objectContaining({ startUtc: "2026-10-08T10:00:00.000Z" }));
    expect(JSON.stringify(payload)).not.toMatch(/owner-1|private|task|title|notes|reason|category/);
  });

  it("keeps every submission Pending until explicit owner approval or rejection", async () => {
    const { base, db } = await runningServer();
    const { result } = await configure(base);
    const linkId = result.bookingLinkId as string;
    const created = await submit(base, linkId, requestBody());
    const createdData = await created.json() as { requestId: string; status: string };
    expect(created.status).toBe(201);
    expect(createdData.status).toBe("pending");
    const queue = await fetch(base + "/api/owner/booking/requests", { headers: ownerHeaders });
    expect((await queue.json() as { requests: Array<{ status: string }> }).requests[0]?.status).toBe("pending");
    expect(db.prepare("SELECT COUNT(*) AS count FROM confirmed_appointments").get()).toEqual({ count: 0 });
    const approved = await fetch(base + "/api/owner/booking/requests/" + createdData.requestId + "/decision", {
      method: "POST", headers: { ...ownerHeaders, "content-type": "application/json" }, body: JSON.stringify({ decision: "approved" }),
    });
    expect(approved.status).toBe(200);
    expect((await approved.json() as { request: { status: string } }).request.status).toBe("approved");
    expect(db.prepare("SELECT COUNT(*) AS count FROM confirmed_appointments").get()).toEqual({ count: 1 });

    const other = await submit(base, linkId, requestBody("2026-10-08T12:00:00.000Z", "2026-10-08T12:30:00.000Z"));
    const otherData = await other.json() as { requestId: string; status: string };
    const rejected = await fetch(base + "/api/owner/booking/requests/" + otherData.requestId + "/decision", {
      method: "POST", headers: { ...ownerHeaders, "content-type": "application/json" }, body: JSON.stringify({ decision: "rejected" }),
    });
    expect(rejected.status).toBe(200);
    expect((await rejected.json() as { request: { status: string } }).request.status).toBe("rejected");
    expect(db.prepare("SELECT COUNT(*) AS count FROM confirmed_appointments").get()).toEqual({ count: 1 });
  });

  it("rejects malformed and policy-invalid public requests without storing them", async () => {
    const { base, db } = await runningServer();
    const { result } = await configure(base);
    const linkId = result.bookingLinkId as string;
    expect((await submit(base, linkId, { ...requestBody(), durationMinutes: 45 })).status).toBe(400);
    expect((await submit(base, linkId, { ...requestBody(), requestedStartUtc: "2026-10-08T08:59:00.000Z", requestedEndUtc: "2026-10-08T09:29:00.000Z" })).status).toBe(400);
    expect((await submit(base, linkId, { ...requestBody(), extra: "private data" })).status).toBe(400);
    expect(db.prepare("SELECT COUNT(*) AS count FROM booking_requests").get()).toEqual({ count: 0 });
  });

  it("rechecks conflicts at approval and rolls back without changing Pending state", async () => {
    const { base, db } = await runningServer();
    const { result } = await configure(base);
    const linkId = result.bookingLinkId as string;
    const created = await submit(base, linkId, requestBody());
    const { requestId } = await created.json() as { requestId: string };
    db.prepare("INSERT INTO busy_intervals (owner_id, start_utc, end_utc, source_revision, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("owner-1", "2026-10-08T10:00:00.000Z", "2026-10-08T10:30:00.000Z", 2, now.toISOString());
    const approval = await fetch(base + "/api/owner/booking/requests/" + requestId + "/decision", {
      method: "POST", headers: { ...ownerHeaders, "content-type": "application/json" }, body: JSON.stringify({ decision: "approved" }),
    });
    expect(approval.status).toBe(409);
    expect(db.prepare("SELECT status FROM booking_requests WHERE request_id = ?").get(requestId)).toEqual({ status: "pending" });
    expect(db.prepare("SELECT COUNT(*) AS count FROM confirmed_appointments").get()).toEqual({ count: 0 });
  });

  it("serializes simultaneous overlapping submissions and approval against a new request", async () => {
    const { base } = await runningServer();
    const { result } = await configure(base);
    const linkId = result.bookingLinkId as string;
    const simultaneous = await Promise.all([submit(base, linkId, requestBody()), submit(base, linkId, requestBody())]);
    expect(simultaneous.map((response) => response.status).sort()).toEqual([201, 409]);

    const ownerQueue = await fetch(base + "/api/owner/booking/requests", { headers: ownerHeaders });
    const queueData = await ownerQueue.json() as { requests: Array<{ id: string }> };
    const requestId = queueData.requests[0]?.id;
    if (!requestId) throw new Error("Expected a pending booking request");
    const [approval, competingRequest] = await Promise.all([
      fetch(base + "/api/owner/booking/requests/" + requestId + "/decision", {
        method: "POST", headers: { ...ownerHeaders, "content-type": "application/json" }, body: JSON.stringify({ decision: "approved" }),
      }),
      submit(base, linkId, requestBody("2026-10-08T10:00:00.000Z", "2026-10-08T10:30:00.000Z")),
    ]);
    expect(approval.status).toBe(200);
    expect(competingRequest.status).toBe(409);
  });
});
