import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createBookingLinkId, type OwnerAvailabilityConfiguration } from "../src/domain/booking";
import {
  BookingRequestConflictError, createPendingBookingRequest, decideOwnerBookingRequest,
  getBookingLinkConfiguration, listConfirmedAppointments, listOwnerBookingRequests,
  saveBookingLinkConfiguration,
} from "../server/db/repositories/bookings";
import { initializeBookingSchema } from "../server/db/schema";

const databases: Database.Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) if (db.open) db.close(); });

function setup() {
  const db = new Database(":memory:");
  databases.push(db);
  initializeBookingSchema(db);
  const linkId = createBookingLinkId();
  const configuration: OwnerAvailabilityConfiguration = {
    bookingLinkId: linkId, enabled: true, allowedDurationsMinutes: [30, 60],
    windows: [{ weekday: 4, startLocal: "09:00", endLocal: "17:00" }],
    minimumNoticeMinutes: 30, maximumAdvanceMinutes: 60 * 24 * 90,
    bufferBeforeMinutes: 10, bufferAfterMinutes: 10, timeZone: "Asia/Yerevan",
    expiresAtUtc: "2027-01-01T00:00:00.000Z",
  };
  saveBookingLinkConfiguration(db, "owner-1", configuration, new Date("2026-10-08T08:00:00.000Z"));
  const submission = {
    requesterName: "Alex Example", requesterEmail: "alex@example.com", requesterNote: "Short booking note",
    requestedStartUtc: "2026-10-08T10:00:00.000Z", requestedEndUtc: "2026-10-08T10:30:00.000Z",
    durationMinutes: 30,
  };
  return { db, linkId, configuration, submission };
}

describe("booking SQLite repositories", () => {
  it("persists owner link policy and resolves it through a unique hashed opaque link token", () => {
    const { db, linkId, configuration } = setup();
    expect(getBookingLinkConfiguration(db, linkId)).toEqual(configuration);
    const storedHash = db.prepare("SELECT link_id_hash FROM booking_links").get() as { link_id_hash: string };
    expect(storedHash.link_id_hash).not.toBe(linkId);
    expect(storedHash.link_id_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(() => saveBookingLinkConfiguration(db, "owner-1", { ...configuration, allowedDurationsMinutes: [30, 30] })).toThrow();
    expect(getBookingLinkConfiguration(db, linkId)).toEqual(configuration);
  });

  it("persists Pending, Approved, and Rejected states with a confirmed appointment only on approval", () => {
    const { db, linkId, submission } = setup();
    const pending = createPendingBookingRequest(db, linkId, submission, new Date("2026-10-08T08:00:00.000Z"));
    expect(pending.status).toBe("pending");
    expect(listOwnerBookingRequests(db, "owner-1", "pending")).toEqual([pending]);
    expect(JSON.stringify(pending)).not.toMatch(/activityId|taskId|title|category|fullSchedule/);

    const approved = decideOwnerBookingRequest(db, "owner-1", pending.id, "approved", new Date("2026-10-08T08:05:00.000Z"));
    expect(approved.status).toBe("approved");
    expect(listConfirmedAppointments(db, "owner-1")).toHaveLength(1);
    expect(() => decideOwnerBookingRequest(db, "owner-1", pending.id, "rejected")).toThrow(/pending/);

    const other = createPendingBookingRequest(db, linkId, {
      ...submission, requestedStartUtc: "2026-10-08T12:00:00.000Z", requestedEndUtc: "2026-10-08T12:30:00.000Z",
    }, new Date("2026-10-08T08:00:00.000Z"));
    expect(decideOwnerBookingRequest(db, "owner-1", other.id, "rejected").status).toBe("rejected");
    expect(listConfirmedAppointments(db, "owner-1")).toHaveLength(1);
    expect(listOwnerBookingRequests(db, "owner-1").map(({ status }) => status).sort()).toEqual(["approved", "rejected"]);
  });

  it("rejects an occupied request slot without leaving a partial request", () => {
    const { db, linkId, submission } = setup();
    db.prepare("INSERT INTO busy_intervals (owner_id, start_utc, end_utc, source_revision, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("owner-1", "2026-10-08T10:20:00.000Z", "2026-10-08T11:00:00.000Z", 1, "2026-10-08T08:00:00.000Z");
    expect(() => createPendingBookingRequest(db, linkId, submission, new Date("2026-10-08T08:00:00.000Z"))).toThrow(BookingRequestConflictError);
    expect(listOwnerBookingRequests(db, "owner-1")).toEqual([]);
  });

  it("keeps the request Pending and creates no appointment if its slot becomes busy before approval", () => {
    const { db, linkId, submission } = setup();
    const request = createPendingBookingRequest(db, linkId, submission, new Date("2026-10-08T08:00:00.000Z"));
    db.prepare("INSERT INTO busy_intervals (owner_id, start_utc, end_utc, source_revision, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("owner-1", "2026-10-08T10:00:00.000Z", "2026-10-08T10:30:00.000Z", 2, "2026-10-08T09:00:00.000Z");
    expect(() => decideOwnerBookingRequest(db, "owner-1", request.id, "approved")).toThrow(BookingRequestConflictError);
    expect(listOwnerBookingRequests(db, "owner-1")[0]?.status).toBe("pending");
    expect(listConfirmedAppointments(db, "owner-1")).toEqual([]);
  });

  it("prevents overlapping pending requests and preserves the existing projection table", () => {
    const { db, linkId, submission } = setup();
    const first = createPendingBookingRequest(db, linkId, submission, new Date("2026-10-08T08:00:00.000Z"));
    expect(() => createPendingBookingRequest(db, linkId, submission, new Date("2026-10-08T08:01:00.000Z"))).toThrow(BookingRequestConflictError);
    decideOwnerBookingRequest(db, "owner-1", first.id, "approved");
    expect(listConfirmedAppointments(db, "owner-1")).toHaveLength(1);
    const columns = db.prepare("PRAGMA table_info(busy_intervals)").all() as Array<{ name: string }>;
    expect(columns.map(({ name }) => name)).toEqual(["owner_id", "start_utc", "end_utc", "source_revision", "updated_at"]);
  });

  it("stores no private task titles, notes, categories, or schedule fields", () => {
    const { db } = setup();
    const bookingTables = ["booking_links", "booking_availability", "booking_allowed_durations", "booking_availability_windows", "booking_requests", "confirmed_appointments"];
    for (const table of bookingTables) {
      const columns = db.prepare("SELECT name FROM pragma_table_info(?)").all(table) as Array<{ name: string }>;
      expect(columns.map(({ name }) => name).join(",")).not.toMatch(/task|activity|category|schedule|title/);
    }
  });
});
