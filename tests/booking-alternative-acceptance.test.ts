import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../server/app";
import { initializeBookingSchema } from "../server/db/schema";
import { proposeBookingAlternative, respondToPublicAlternative } from "../src/platform/bookingClient";

const nowUtc = "2026-10-08T08:00:00.000Z";
const proposalInput = { proposedDate: "2026-10-10", proposedStartTime: "11:00", durationMinutes: 60, timeZone: "Asia/Yerevan" };
const ownerHeaders = { "x-lxnoro-dev-owner-id": "local-owner" };
const opened: Array<{ close: () => Promise<void>; db: Database.Database }> = [];

async function setup() {
  const db = new Database(":memory:");
  initializeBookingSchema(db);
  const app = createServer(db, { developmentAuth: true, bookingNow: () => new Date(nowUtc) });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  const base = `http://127.0.0.1:${address.port}`;
  const fetcher: typeof fetch = (input, init) => fetch(new URL(String(input), base), init);
  opened.push({ close: () => app.close(), db });
  const config = await fetcher("/api/owner/booking/configuration", {
    method: "PUT", headers: { ...ownerHeaders, "content-type": "application/json" },
    body: JSON.stringify({ enabled: true, allowedDurationsMinutes: [30, 60], windows: [{ weekday: 4, startLocal: "09:00", endLocal: "17:00" }], minimumNoticeMinutes: 30, maximumAdvanceMinutes: 60 * 24 * 90, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, timeZone: "Asia/Yerevan", expiresAtUtc: "2026-12-31T00:00:00.000Z" }),
  });
  const { bookingLinkId } = await config.json() as { bookingLinkId: string };
  const created = await fetcher(`/api/public/booking/${bookingLinkId}/requests`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ requesterName: "Jordan Example", requesterEmail: "jordan@example.com", requesterNote: "Private requester message", requestedStartUtc: "2026-10-08T10:00:00.000Z", requestedEndUtc: "2026-10-08T10:30:00.000Z", durationMinutes: 30 }),
  });
  const { requestId } = await created.json() as { requestId: string };
  const proposal = await proposeBookingAlternative(requestId, proposalInput, fetcher);
  return { db, base, fetcher, requestId, responseKey: proposal.responseKey, proposal };
}

function publishFreshProjection(db: Database.Database, revision = 12, updatedAt = nowUtc): void {
  db.prepare("INSERT INTO booking_projection_state(owner_id,source_revision,updated_at) VALUES(?,?,?)").run("local-owner", revision, updatedAt);
}

async function accept(fetcher: typeof fetch, key: string) {
  return fetcher(`/api/public/booking/alternatives/${key}/response`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "accept" }),
  });
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map(async ({ close, db }) => { await close(); if (db.open) db.close(); }));
});

describe("transactional alternative acceptance", () => {
  it("accepts against a fresh projection and persists the alternative appointment atomically", async () => {
    const state = await setup();
    publishFreshProjection(state.db);
    const response = await accept(state.fetcher, state.responseKey);
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body).toEqual({ status: "accepted", proposedDate: "2026-10-10", proposedStartTime: "11:00", durationMinutes: 60, timeZone: "Asia/Yerevan" });
    expect(JSON.stringify(body)).not.toMatch(/owner|requestId|proposalId|activity|task|title|notes|category|schedule|reason|Jordan|jordan@example/);
    expect(state.db.prepare("SELECT status,requested_start_utc FROM booking_requests WHERE request_id=?").get(state.requestId)).toEqual({ status: "approved", requested_start_utc: "2026-10-08T10:00:00.000Z" });
    expect(state.db.prepare("SELECT status,confirmed_projection_revision FROM booking_alternative_proposals").get()).toEqual({ status: "accepted", confirmed_projection_revision: 12 });
    expect(state.db.prepare("SELECT start_utc,end_utc,duration_minutes,time_zone FROM confirmed_appointments WHERE request_id=?").get(state.requestId)).toEqual({ start_utc: "2026-10-10T07:00:00.000Z", end_utc: "2026-10-10T08:00:00.000Z", duration_minutes: 60, time_zone: "Asia/Yerevan" });
    expect(state.db.prepare("SELECT status FROM booking_email_deliveries WHERE request_id=?").get(state.requestId)).toEqual({ status: "pending" });
  });

  it.each([
    ["missing", undefined, "booking_projection_unavailable"],
    ["stale", "2026-10-08T07:54:59.999Z", "booking_projection_stale"],
  ])("does not mutate a proposal when its projection is %s", async (_label, updatedAt, expectedCode) => {
    const state = await setup();
    if (updatedAt) publishFreshProjection(state.db, 3, updatedAt);
    const response = await accept(state.fetcher, state.responseKey);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: expectedCode });
    expect(state.db.prepare("SELECT status FROM booking_requests WHERE request_id=?").get(state.requestId)).toEqual({ status: "pending" });
    expect(state.db.prepare("SELECT status,confirmed_projection_revision FROM booking_alternative_proposals").get()).toEqual({ status: "proposed", confirmed_projection_revision: null });
    expect(state.db.prepare("SELECT COUNT(*) AS count FROM confirmed_appointments").get()).toEqual({ count: 0 });
  });

  it("rechecks a newly conflicting interval before acceptance", async () => {
    const state = await setup();
    publishFreshProjection(state.db);
    // A busy interval published after the proposal must be considered by the final transaction.
    state.db.prepare("INSERT INTO busy_intervals(owner_id,start_utc,end_utc,source_revision,updated_at) VALUES(?,?,?,?,?)")
      .run("local-owner", "2026-10-10T07:30:00.000Z", "2026-10-10T07:45:00.000Z", 12, nowUtc);
    const response = await accept(state.fetcher, state.responseKey);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ code: "slot_unavailable" });
    expect(state.db.prepare("SELECT status FROM booking_requests WHERE request_id=?").get(state.requestId)).toEqual({ status: "pending" });
    expect(state.db.prepare("SELECT status FROM booking_alternative_proposals").get()).toEqual({ status: "proposed" });
    expect(state.db.prepare("SELECT COUNT(*) AS count FROM confirmed_appointments").get()).toEqual({ count: 0 });
  });

  it("rolls back proposal, parent, appointment, and delivery changes on transactional failure", async () => {
    const state = await setup();
    publishFreshProjection(state.db);
    state.db.exec("CREATE TRIGGER reject_appointment BEFORE INSERT ON confirmed_appointments BEGIN SELECT RAISE(ABORT, 'test rollback'); END;");
    const response = await accept(state.fetcher, state.responseKey);
    expect(response.status).toBe(500);
    expect(state.db.prepare("SELECT status,confirmed_projection_revision FROM booking_alternative_proposals").get()).toEqual({ status: "proposed", confirmed_projection_revision: null });
    expect(state.db.prepare("SELECT status FROM booking_requests WHERE request_id=?").get(state.requestId)).toEqual({ status: "pending" });
    expect(state.db.prepare("SELECT COUNT(*) AS count FROM confirmed_appointments").get()).toEqual({ count: 0 });
    expect(state.db.prepare("SELECT COUNT(*) AS count FROM booking_email_deliveries").get()).toEqual({ count: 0 });
  });

  it("prevents duplicate acceptance and leaves one confirmed appointment", async () => {
    const state = await setup();
    publishFreshProjection(state.db);
    expect((await accept(state.fetcher, state.responseKey)).status).toBe(200);
    const second = await accept(state.fetcher, state.responseKey);
    expect(second.status).toBe(409);
    expect(state.db.prepare("SELECT COUNT(*) AS count FROM confirmed_appointments WHERE request_id=?").get(state.requestId)).toEqual({ count: 1 });
    expect(state.db.prepare("SELECT COUNT(*) AS count FROM booking_email_deliveries WHERE request_id=?").get(state.requestId)).toEqual({ count: 1 });
  });
});
