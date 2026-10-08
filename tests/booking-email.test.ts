import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../server/app";
import { decideOwnerBookingRequest, createPendingBookingRequest, saveBookingLinkConfiguration } from "../server/db/repositories/bookings";
import { getBookingEmailDeliveryState } from "../server/db/repositories/bookingEmails";
import { BookingEmailDispatcher } from "../server/email/bookingConfirmation";
import type { BookingConfirmationEmail, BookingConfirmationMailer } from "../server/email/types";
import { createBookingLinkId, type OwnerAvailabilityConfiguration } from "../src/domain/booking";
import { initializeBookingSchema } from "../server/db/schema";

const databases: Database.Database[] = [];
const apps: Array<{ close: () => Promise<void> }> = [];
const fixedNow = new Date("2026-10-08T08:00:00.000Z");
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const db of databases.splice(0)) if (db.open) db.close();
});

function setupApprovedRequest() {
  const db = new Database(":memory:");
  databases.push(db);
  initializeBookingSchema(db);
  const linkId = createBookingLinkId();
  const configuration: OwnerAvailabilityConfiguration = {
    bookingLinkId: linkId, enabled: true, allowedDurationsMinutes: [30],
    windows: [{ weekday: 4, startLocal: "09:00", endLocal: "17:00" }],
    minimumNoticeMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
    timeZone: "Asia/Yerevan", expiresAtUtc: "2026-12-31T00:00:00.000Z",
  };
  saveBookingLinkConfiguration(db, "owner-1", configuration, fixedNow);
  const request = createPendingBookingRequest(db, linkId, {
    requesterName: "Alex Example",
    requesterEmail: "alex@example.com",
    requesterNote: "private requester note",
    requestedStartUtc: "2026-10-08T10:00:00.000Z",
    requestedEndUtc: "2026-10-08T10:30:00.000Z",
    durationMinutes: 30,
  }, fixedNow);
  decideOwnerBookingRequest(db, "owner-1", request.id, "approved", fixedNow);
  return { db, request };
}

function dispatcher(
  db: Database.Database,
  mailer: BookingConfirmationMailer | undefined,
  now: () => Date,
  overrides: { maxAttempts?: number; baseRetryMilliseconds?: number } = {},
) {
  return new BookingEmailDispatcher(db, mailer, {
    messageIdDomain: "mail.example.test",
    now,
    ...overrides,
  });
}

describe("booking confirmation email delivery", () => {
  it("sends only requester and confirmed appointment details and records Sent", async () => {
    const { db, request } = setupApprovedRequest();
    let sent: BookingConfirmationEmail | undefined;
    const mailer: BookingConfirmationMailer = { sendConfirmation: async (email) => { sent = email; } };
    const delivery = await dispatcher(db, mailer, () => fixedNow).deliverRequestNow(request.id);

    expect(delivery).toMatchObject({ status: "sent", attemptCount: 1, lastErrorCode: null });
    expect(sent?.to).toEqual({ name: "Alex Example", email: "alex@example.com" });
    expect(sent?.text).toContain("October");
    expect(sent?.text).toContain("30 minutes");
    expect(sent?.text).toContain("Asia/Yerevan");
    expect(sent?.text).not.toContain("private requester note");
    expect(sent?.text).not.toMatch(/task|category|schedule|appointment reason/i);
    expect(sent?.messageId).toMatch(/^<booking-confirmation-[0-9a-f-]+@mail\.example\.test>$/);
  });

  it("records transient SMTP failure as pending with a durable retry time", async () => {
    const { db, request } = setupApprovedRequest();
    const mailer: BookingConfirmationMailer = { sendConfirmation: async () => { throw new Error("private transport detail"); } };
    const delivery = await dispatcher(db, mailer, () => fixedNow).deliverRequestNow(request.id);
    expect(delivery).toMatchObject({
      status: "pending",
      attemptCount: 1,
      lastErrorCode: "smtp_delivery_failed",
      nextAttemptAtUtc: "2026-10-08T08:01:00.000Z",
    });
    expect(JSON.stringify(delivery)).not.toContain("private transport detail");
  });

  it("retries with a stable message ID and records Sent after a successful retry", async () => {
    const { db, request } = setupApprovedRequest();
    let now = fixedNow;
    const messageIds: string[] = [];
    let attempts = 0;
    const mailer: BookingConfirmationMailer = {
      sendConfirmation: async (email) => {
        messageIds.push(email.messageId);
        attempts += 1;
        if (attempts === 1) throw new Error("temporary failure");
      },
    };
    const service = dispatcher(db, mailer, () => now, { baseRetryMilliseconds: 1_000 });
    expect((await service.deliverRequestNow(request.id))?.status).toBe("pending");
    now = new Date(fixedNow.getTime() + 1_000);
    expect((await service.deliverRequestNow(request.id))?.status).toBe("sent");
    expect(messageIds).toHaveLength(2);
    expect(messageIds[0]).toBe(messageIds[1]);
    expect(getBookingEmailDeliveryState(db, request.id)).toMatchObject({ status: "sent", attemptCount: 2 });
  });

  it("marks delivery failed after the configured retry limit", async () => {
    const { db, request } = setupApprovedRequest();
    const mailer: BookingConfirmationMailer = { sendConfirmation: async () => { throw new Error("relay error"); } };
    const delivery = await dispatcher(db, mailer, () => fixedNow, { maxAttempts: 1 }).deliverRequestNow(request.id);
    expect(delivery).toMatchObject({ status: "failed", attemptCount: 1, nextAttemptAtUtc: null });
  });

  it("keeps an approved appointment confirmed when immediate email delivery fails", async () => {
    const db = new Database(":memory:");
    databases.push(db);
    initializeBookingSchema(db);
    const mailer: BookingConfirmationMailer = { sendConfirmation: async () => { throw new Error("relay unavailable"); } };
    const app = createServer(db, {
      developmentAuth: true,
      bookingNow: () => fixedNow,
      bookingConfirmationMailer: mailer,
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    apps.push({ close: () => app.close() });
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    const base = "http://127.0.0.1:" + address.port;
    const config = {
      enabled: true, allowedDurationsMinutes: [30], windows: [{ weekday: 4, startLocal: "09:00", endLocal: "17:00" }],
      minimumNoticeMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, timeZone: "Asia/Yerevan",
    };
    const configured = await fetch(base + "/api/owner/booking/configuration", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-lxnoro-dev-owner-id": "owner-1" },
      body: JSON.stringify(config),
    });
    const { bookingLinkId } = await configured.json() as { bookingLinkId: string };
    const created = await fetch(base + "/api/public/booking/" + bookingLinkId + "/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requesterName: "Alex Example", requesterEmail: "alex@example.com",
        requestedStartUtc: "2026-10-08T10:00:00.000Z", requestedEndUtc: "2026-10-08T10:30:00.000Z",
        durationMinutes: 30,
      }),
    });
    const { requestId } = await created.json() as { requestId: string };
    const approval = await fetch(base + "/api/owner/booking/requests/" + requestId + "/decision", {
      method: "POST",
      headers: { "content-type": "application/json", "x-lxnoro-dev-owner-id": "owner-1" },
      body: JSON.stringify({ decision: "approved" }),
    });
    const response = await approval.json() as { request: { status: string }; confirmationEmail: { status: string; lastErrorCode: string } };
    expect(approval.status).toBe(200);
    expect(response.request.status).toBe("approved");
    expect(response.confirmationEmail).toMatchObject({ status: "pending", lastErrorCode: "smtp_delivery_failed" });
    expect(db.prepare("SELECT COUNT(*) AS count FROM confirmed_appointments").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT status FROM booking_requests WHERE request_id = ?").get(requestId)).toEqual({ status: "approved" });
  });
});
