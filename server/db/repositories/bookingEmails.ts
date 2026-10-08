import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

export type BookingEmailStatus = "pending" | "sent" | "failed";

export interface BookingEmailDeliveryState {
  status: BookingEmailStatus;
  attemptCount: number;
  nextAttemptAtUtc: string | null;
  lastErrorCode: string | null;
  sentAtUtc: string | null;
}

export interface DueBookingEmail {
  deliveryId: string;
  requestId: string;
  leaseToken: string;
  attemptCount: number;
  recipientName: string;
  recipientEmail: string;
  startUtc: string;
  endUtc: string;
  durationMinutes: number;
  timeZone: string;
}

function isoNow(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError("Current time is invalid");
  return date.toISOString();
}

export function claimDueBookingEmail(
  db: Database.Database,
  now: Date,
  leaseMilliseconds: number,
  requestId?: string,
): DueBookingEmail | undefined {
  const nowUtc = isoNow(now);
  const leaseUntil = new Date(now.getTime() + leaseMilliseconds).toISOString();
  const claimToken = randomUUID();
  const whereRequest = requestId ? "AND delivery.request_id = ?" : "";
  const params = requestId ? [nowUtc, nowUtc, requestId] : [nowUtc, nowUtc];
  const claim = db.transaction(() => {
    const row = db.prepare(
      "SELECT delivery.delivery_id, delivery.request_id, delivery.attempt_count, " +
      "request.requester_name, request.requester_email, appointment.start_utc, " +
      "appointment.end_utc, appointment.duration_minutes, appointment.time_zone " +
      "FROM booking_email_deliveries AS delivery " +
      "JOIN booking_requests AS request ON request.request_id = delivery.request_id " +
      "JOIN confirmed_appointments AS appointment ON appointment.request_id = request.request_id " +
      "WHERE delivery.status = 'pending' AND delivery.next_attempt_at_utc <= ? " +
      "AND (delivery.lease_until_utc IS NULL OR delivery.lease_until_utc <= ?) " +
      whereRequest + " ORDER BY delivery.created_at_utc LIMIT 1",
    ).get(...params) as {
      delivery_id: string; request_id: string; attempt_count: number; requester_name: string;
      requester_email: string; start_utc: string; end_utc: string; duration_minutes: number; time_zone: string;
    } | undefined;
    if (!row) return undefined;
    const result = db.prepare(
      "UPDATE booking_email_deliveries SET lease_token = ?, lease_until_utc = ?, " +
      "attempt_count = attempt_count + 1, updated_at_utc = ? " +
      "WHERE delivery_id = ? AND status = 'pending' AND (lease_until_utc IS NULL OR lease_until_utc <= ?)",
    ).run(claimToken, leaseUntil, nowUtc, row.delivery_id, nowUtc);
    if (result.changes !== 1) return undefined;
    return {
      deliveryId: row.delivery_id, requestId: row.request_id, leaseToken: claimToken,
      attemptCount: row.attempt_count + 1, recipientName: row.requester_name,
      recipientEmail: row.requester_email, startUtc: row.start_utc, endUtc: row.end_utc,
      durationMinutes: row.duration_minutes, timeZone: row.time_zone,
    };
  });
  return claim.immediate();
}

export function markBookingEmailSent(db: Database.Database, email: DueBookingEmail, now: Date): boolean {
  const timestamp = isoNow(now);
  const result = db.prepare(
    "UPDATE booking_email_deliveries SET status = 'sent', sent_at_utc = ?, updated_at_utc = ?, " +
    "last_error_code = NULL, lease_token = NULL, lease_until_utc = NULL " +
    "WHERE delivery_id = ? AND status = 'pending' AND lease_token = ?",
  ).run(timestamp, timestamp, email.deliveryId, email.leaseToken);
  return result.changes === 1;
}

export function markBookingEmailAttemptFailed(
  db: Database.Database,
  email: DueBookingEmail,
  now: Date,
  errorCode: string,
  retryAt: Date | undefined,
): boolean {
  const timestamp = isoNow(now);
  const status: BookingEmailStatus = retryAt ? "pending" : "failed";
  const result = db.prepare(
    "UPDATE booking_email_deliveries SET status = ?, next_attempt_at_utc = ?, updated_at_utc = ?, " +
    "last_error_code = ?, lease_token = NULL, lease_until_utc = NULL " +
    "WHERE delivery_id = ? AND status = 'pending' AND lease_token = ?",
  ).run(status, retryAt ? retryAt.toISOString() : timestamp, timestamp, errorCode, email.deliveryId, email.leaseToken);
  return result.changes === 1;
}

export function getBookingEmailDeliveryState(db: Database.Database, requestId: string): BookingEmailDeliveryState | undefined {
  const row = db.prepare(
    "SELECT status, attempt_count, next_attempt_at_utc, last_error_code, sent_at_utc " +
    "FROM booking_email_deliveries WHERE request_id = ?",
  ).get(requestId) as {
    status: BookingEmailStatus; attempt_count: number; next_attempt_at_utc: string;
    last_error_code: string | null; sent_at_utc: string | null;
  } | undefined;
  if (!row) return undefined;
  return {
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAtUtc: row.status === "pending" ? row.next_attempt_at_utc : null,
    lastErrorCode: row.last_error_code,
    sentAtUtc: row.sent_at_utc,
  };
}

export function listDueBookingEmailRequestIds(db: Database.Database, now: Date, limit = 25): string[] {
  return (db.prepare(
    "SELECT request_id FROM booking_email_deliveries WHERE status = 'pending' AND next_attempt_at_utc <= ? " +
    "AND (lease_until_utc IS NULL OR lease_until_utc <= ?) ORDER BY created_at_utc LIMIT ?",
  ).all(isoNow(now), isoNow(now), limit) as Array<{ request_id: string }>).map(({ request_id }) => request_id);
}
