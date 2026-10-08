import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { buildBookingReminderCadence, deferBookingReminderUntilAllowed, ownerLocalDate } from "../server/domain/bookingReminders";
import {
  claimDueBookingReminderJob,
  completeClaimedBookingReminderJob,
  insertBookingReminderJobsForPendingRequest,
  reconcileBookingReminderJobs,
  recoverExpiredBookingReminderLeases,
  setOwnerBookingReminderQuietHours,
} from "../server/db/repositories/bookingReminders";
import { createPendingBookingRequest, decideOwnerBookingRequest, saveBookingLinkConfiguration } from "../server/db/repositories/bookings";
import { initializeBookingSchema, openBookingDatabase } from "../server/db/schema";
import { createBookingLinkId, type BookingLinkId } from "../src/domain/booking";

const defaultNow = new Date("2026-10-08T08:00:00.000Z");
const temporaryDirectories: string[] = [];

function setup(options: { now?: Date; timeZone?: string; requestedStartUtc?: string } = {}) {
  const now = options.now ?? defaultNow;
  const timeZone = options.timeZone ?? "Asia/Yerevan";
  const requestedStartUtc = options.requestedStartUtc ?? "2026-10-10T07:00:00.000Z";
  const db = new Database(":memory:");
  initializeBookingSchema(db);
  const linkId = createBookingLinkId();
  saveBookingLinkConfiguration(db, "owner-private", {
    bookingLinkId: linkId as BookingLinkId,
    enabled: true,
    allowedDurationsMinutes: [30],
    windows: [],
    minimumNoticeMinutes: 0,
    maximumAdvanceMinutes: 60 * 24 * 90,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    timeZone,
    expiresAtUtc: "2026-12-31T00:00:00.000Z",
  }, now);
  const request = createPendingBookingRequest(db, linkId, {
    requesterName: "Private Requester",
    requesterEmail: "private@example.com",
    requesterNote: "Do not copy into reminder jobs",
    requestedStartUtc,
    requestedEndUtc: new Date(Date.parse(requestedStartUtc) + 30 * 60_000).toISOString(),
    durationMinutes: 30,
  }, now);
  return { db, request, now, linkId };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("durable owner booking reminders", () => {
  it("creates only privacy-minimal durable jobs and prevents duplicate cadence rows", () => {
    const { db, request, now } = setup();
    try {
      const count = db.prepare("SELECT COUNT(*) AS count FROM booking_reminder_jobs WHERE request_id=?").get(request.id) as { count: number };
      expect(count.count).toBe(9); // same-day, T-24h and seven 3-hour follow-ups
      expect(insertBookingReminderJobsForPendingRequest(db, request.id, now)).toBe(0);
      expect(reconcileBookingReminderJobs(db, now)).toEqual({ inserted: 0, cancelled: 0 });
      const columns = db.prepare("PRAGMA table_info(booking_reminder_jobs)").all() as Array<{ name: string }>;
      expect(columns.map(({ name }) => name)).not.toEqual(expect.arrayContaining(["requester_name", "requester_email", "requester_note", "task_title", "notes"]));
      expect(db.prepare("SELECT cadence,idempotency_key FROM booking_reminder_jobs WHERE request_id=? ORDER BY due_at_utc LIMIT 1").get(request.id))
        .toMatchObject({ cadence: "same_day" });
    } finally { db.close(); }
  });

  it("schedules same-day, 24-hour, and every-three-hour reminders at their intended instants", () => {
    const cadence = buildBookingReminderCadence({
      requestId: "opaque-request", createdAtUtc: defaultNow.toISOString(), requestedStartUtc: "2026-10-10T07:00:00.000Z", timeZone: "Asia/Yerevan",
    });
    expect(cadence[0]).toMatchObject({ cadence: "same_day", dueAtUtc: defaultNow.toISOString(), cadenceKey: "same-day:2026-10-08" });
    expect(cadence[1]).toMatchObject({ cadence: "24_hour", dueAtUtc: "2026-10-09T07:00:00.000Z" });
    expect(cadence.slice(2).map(({ dueAtUtc }) => dueAtUtc)).toEqual([
      "2026-10-09T10:00:00.000Z", "2026-10-09T13:00:00.000Z", "2026-10-09T16:00:00.000Z",
      "2026-10-09T19:00:00.000Z", "2026-10-09T22:00:00.000Z", "2026-10-10T01:00:00.000Z", "2026-10-10T04:00:00.000Z",
    ]);
  });

  it("defers quiet-hour reminders to the next allowed owner-local time", () => {
    const { db, request, now } = setup();
    try {
      setOwnerBookingReminderQuietHours(db, "owner-private", "11:00", "13:00");
      expect(claimDueBookingReminderJob(db, now)).toBeUndefined();
      const due = db.prepare("SELECT due_at_utc FROM booking_reminder_jobs WHERE request_id=? AND cadence='same_day'").get(request.id) as { due_at_utc: string };
      expect(due.due_at_utc).toBe("2026-10-08T09:00:00.000Z"); // 13:00 in Asia/Yerevan
      expect(deferBookingReminderUntilAllowed("2026-10-08T07:30:00.000Z", "Asia/Yerevan", "23:00", "07:00"))
        .toBe("2026-10-08T07:30:00.000Z"); // 11:30 local is outside overnight quiet hours
      expect(reconcileBookingReminderJobs(db, now).inserted).toBe(0);
    } finally { db.close(); }
  });

  it("claims once, prevents a second live lease, and recovers an abandoned lease after restart", () => {
    const { db, request, now } = setup();
    try {
      const first = claimDueBookingReminderJob(db, now, 30_000);
      expect(first).toMatchObject({ requestId: request.id, ownerId: "owner-private", cadence: "same_day", ownerTimeZone: "Asia/Yerevan" });
      expect(claimDueBookingReminderJob(db, now, 30_000)).toBeUndefined();
      expect(recoverExpiredBookingReminderLeases(db, new Date(now.getTime() + 30_001))).toBe(1);
      const recovered = claimDueBookingReminderJob(db, new Date(now.getTime() + 30_001), 30_000);
      expect(recovered?.reminderId).toBe(first?.reminderId);
      expect(recovered?.leaseToken).not.toBe(first?.leaseToken);
      expect(completeClaimedBookingReminderJob(db, recovered!.reminderId, first!.leaseToken, now)).toBe(false);
      expect(completeClaimedBookingReminderJob(db, recovered!.reminderId, recovered!.leaseToken, new Date(now.getTime() + 30_002))).toBe(true);
    } finally { db.close(); }
  });

  it("recovers pending reminders from SQLite after the database connection is reopened", () => {
    const directory = mkdtempSync(join(process.cwd(), ".booking-reminder-test-"));
    temporaryDirectories.push(directory);
    const filename = join(directory, "reminders.sqlite");
    const firstDb = openBookingDatabase(filename);
    const linkId = createBookingLinkId();
    saveBookingLinkConfiguration(firstDb, "restart-owner", {
      bookingLinkId: linkId as BookingLinkId, enabled: true, allowedDurationsMinutes: [30], windows: [],
      minimumNoticeMinutes: 0, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, timeZone: "Asia/Yerevan",
    }, defaultNow);
    const request = createPendingBookingRequest(firstDb, linkId, {
      requesterName: "Name", requesterEmail: "name@example.com", requestedStartUtc: "2026-10-10T07:00:00.000Z",
      requestedEndUtc: "2026-10-10T07:30:00.000Z", durationMinutes: 30,
    }, defaultNow);
    firstDb.close();
    const restartedDb = openBookingDatabase(filename);
    try {
      expect(reconcileBookingReminderJobs(restartedDb, defaultNow)).toEqual({ inserted: 0, cancelled: 0 });
      expect(claimDueBookingReminderJob(restartedDb, defaultNow)?.requestId).toBe(request.id);
    } finally { restartedDb.close(); }
  });

  it("cancels future jobs when a request is approved or rejected", () => {
    const approved = setup();
    const rejected = setup();
    try {
      decideOwnerBookingRequest(approved.db, "owner-private", approved.request.id, "approved", defaultNow);
      decideOwnerBookingRequest(rejected.db, "owner-private", rejected.request.id, "rejected", defaultNow);
      expect((approved.db.prepare("SELECT COUNT(*) AS count FROM booking_reminder_jobs WHERE request_id=? AND status='cancelled'").get(approved.request.id) as { count: number }).count).toBe(9);
      expect((rejected.db.prepare("SELECT COUNT(*) AS count FROM booking_reminder_jobs WHERE request_id=? AND status='cancelled'").get(rejected.request.id) as { count: number }).count).toBe(9);
      expect(claimDueBookingReminderJob(rejected.db, defaultNow)).toBeUndefined();
    } finally { approved.db.close(); rejected.db.close(); }
  });

  it("does not schedule or claim jobs for expired or non-pending requests", () => {
    const { db, request, now } = setup();
    try {
      db.prepare("UPDATE booking_requests SET requested_start_utc=? WHERE request_id=?").run("2026-10-08T07:59:00.000Z", request.id);
      expect(insertBookingReminderJobsForPendingRequest(db, request.id, now)).toBe(0);
      expect(reconcileBookingReminderJobs(db, now).cancelled).toBe(9);
      expect(claimDueBookingReminderJob(db, now)).toBeUndefined();
    } finally { db.close(); }
  });

  it("uses the booking owner's local calendar day rather than the server UTC day", () => {
    const cadence = buildBookingReminderCadence({
      requestId: "opaque-request", createdAtUtc: "2026-10-08T23:30:00.000Z", requestedStartUtc: "2026-10-10T07:00:00.000Z", timeZone: "Asia/Yerevan",
    });
    expect(cadence[0]?.cadenceKey).toBe("same-day:2026-10-09");
    expect(ownerLocalDate(Date.parse("2026-10-08T23:30:00.000Z"), "Asia/Yerevan")).toBe("2026-10-09");
  });
});
