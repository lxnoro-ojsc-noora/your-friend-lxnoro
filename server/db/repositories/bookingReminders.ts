import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { buildBookingReminderCadence, deferBookingReminderUntilAllowed, type BookingReminderCadence } from "../../domain/bookingReminders";

export interface ClaimedBookingReminderJob {
  reminderId: string;
  requestId: string;
  ownerId: string;
  cadence: BookingReminderCadence;
  idempotencyKey: string;
  dueAtUtc: string;
  requestedStartUtc: string;
  ownerTimeZone: string;
  leaseToken: string;
}

function timestamp(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError("Current time is invalid");
  return date.toISOString();
}

function validateQuietTime(value: string | undefined): void {
  if (value !== undefined && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new RangeError("Quiet hours must use local HH:mm values");
}

/** Quiet hours are owner-local wall times; each request uses the IANA zone from its booking policy. */
export function setOwnerBookingReminderQuietHours(
  db: Database.Database,
  ownerId: string,
  quietStartLocal?: string,
  quietEndLocal?: string,
): void {
  if (!ownerId.trim() || ownerId.length > 128) throw new RangeError("Owner identity is invalid");
  validateQuietTime(quietStartLocal);
  validateQuietTime(quietEndLocal);
  if ((quietStartLocal === undefined) !== (quietEndLocal === undefined)) throw new RangeError("Both quiet-hour boundaries are required");
  if (quietStartLocal === undefined || quietEndLocal === undefined) {
    db.prepare("DELETE FROM booking_reminder_preferences WHERE owner_id = ?").run(ownerId);
    return;
  }
  db.prepare(`
    INSERT INTO booking_reminder_preferences(owner_id,quiet_start_local,quiet_end_local) VALUES(?,?,?)
    ON CONFLICT(owner_id) DO UPDATE SET quiet_start_local=excluded.quiet_start_local, quiet_end_local=excluded.quiet_end_local
  `).run(ownerId, quietStartLocal, quietEndLocal);
}

/** Called in the booking-request transaction; IDs and timestamps only, no requester message or private schedule data. */
export function insertBookingReminderJobsForPendingRequest(db: Database.Database, requestId: string, now: Date): number {
  const request = db.prepare(`
    SELECT request.owner_id, request.created_at_utc, request.requested_start_utc, request.status,
      availability.time_zone, preferences.quiet_start_local, preferences.quiet_end_local
    FROM booking_requests AS request
    JOIN booking_availability AS availability ON availability.link_id_hash = request.link_id_hash
    LEFT JOIN booking_reminder_preferences AS preferences ON preferences.owner_id = request.owner_id
    WHERE request.request_id = ?
  `).get(requestId) as {
    owner_id: string; created_at_utc: string; requested_start_utc: string; status: string; time_zone: string;
    quiet_start_local: string | null; quiet_end_local: string | null;
  } | undefined;
  if (!request || request.status !== "pending" || Date.parse(request.requested_start_utc) <= now.getTime()) return 0;
  const jobs = buildBookingReminderCadence({
    requestId,
    createdAtUtc: request.created_at_utc,
    requestedStartUtc: request.requested_start_utc,
    timeZone: request.time_zone,
    ...(request.quiet_start_local === null ? {} : { quietStartLocal: request.quiet_start_local }),
    ...(request.quiet_end_local === null ? {} : { quietEndLocal: request.quiet_end_local }),
  });
  const insert = db.prepare(`
    INSERT OR IGNORE INTO booking_reminder_jobs
      (reminder_id,request_id,owner_id,cadence,idempotency_key,due_at_utc,status,created_at_utc)
    VALUES(?,?,?,?,?,?,'pending',?)
  `);
  let changes = 0;
  for (const job of jobs) {
    const key = `${requestId}:${job.cadenceKey}`;
    changes += insert.run(randomUUID(), requestId, request.owner_id, job.cadence, key, job.dueAtUtc, timestamp(now)).changes;
  }
  return changes;
}

/** Idempotently repairs reminder rows after restart and cancels requests that are terminal or past their requested time. */
export function reconcileBookingReminderJobs(db: Database.Database, now = new Date()): { inserted: number; cancelled: number } {
  const nowUtc = timestamp(now);
  const reconcile = db.transaction(() => {
    const terminal = db.prepare(`
      UPDATE booking_reminder_jobs SET status='cancelled',lease_token=NULL,lease_until_utc=NULL
      WHERE status IN ('pending','processing') AND request_id IN (
        SELECT request_id FROM booking_requests WHERE status!='pending' OR requested_start_utc<=?
      )
    `).run(nowUtc).changes;
    const requests = db.prepare("SELECT request_id FROM booking_requests WHERE status='pending' AND requested_start_utc>? ORDER BY created_at_utc")
      .all(nowUtc) as Array<{ request_id: string }>;
    let inserted = 0;
    for (const { request_id } of requests) inserted += insertBookingReminderJobsForPendingRequest(db, request_id, now);
    return { inserted, cancelled: terminal };
  });
  return reconcile.immediate();
}

/** Requeues only abandoned leases, allowing a restarted process to recover jobs safely. */
export function recoverExpiredBookingReminderLeases(db: Database.Database, now = new Date()): number {
  return db.prepare(`
    UPDATE booking_reminder_jobs SET status='pending',lease_token=NULL,lease_until_utc=NULL
    WHERE status='processing' AND lease_until_utc<=?
      AND request_id IN (SELECT request_id FROM booking_requests WHERE status='pending' AND requested_start_utc>?)
  `).run(timestamp(now), timestamp(now)).changes;
}

/** Atomically claims one due job; only a single process receives the live lease. */
export function claimDueBookingReminderJob(
  db: Database.Database,
  now = new Date(),
  leaseMilliseconds = 60_000,
): ClaimedBookingReminderJob | undefined {
  if (!Number.isSafeInteger(leaseMilliseconds) || leaseMilliseconds <= 0) throw new RangeError("Lease duration must be positive");
  const nowUtc = timestamp(now);
  const leaseUntil = new Date(now.getTime() + leaseMilliseconds).toISOString();
  const claim = db.transaction((): ClaimedBookingReminderJob | undefined => {
    recoverExpiredBookingReminderLeases(db, now);
    const row = db.prepare(`
      SELECT job.reminder_id,job.request_id,job.owner_id,job.cadence,job.idempotency_key,job.due_at_utc,
        request.requested_start_utc,availability.time_zone,
        preferences.quiet_start_local,preferences.quiet_end_local
      FROM booking_reminder_jobs AS job
      JOIN booking_requests AS request ON request.request_id=job.request_id
      JOIN booking_availability AS availability ON availability.link_id_hash=request.link_id_hash
      LEFT JOIN booking_reminder_preferences AS preferences ON preferences.owner_id=job.owner_id
      WHERE job.status='pending' AND job.due_at_utc<=? AND request.status='pending' AND request.requested_start_utc>?
      ORDER BY job.due_at_utc,job.reminder_id LIMIT 1
    `).get(nowUtc, nowUtc) as {
      reminder_id: string; request_id: string; owner_id: string; cadence: BookingReminderCadence;
      idempotency_key: string; due_at_utc: string; requested_start_utc: string; time_zone: string;
      quiet_start_local: string | null; quiet_end_local: string | null;
    } | undefined;
    if (!row) return undefined;
    const allowedAt = deferBookingReminderUntilAllowed(nowUtc, row.time_zone,
      row.quiet_start_local ?? undefined, row.quiet_end_local ?? undefined);
    if (Date.parse(allowedAt) > now.getTime()) {
      if (Date.parse(allowedAt) >= Date.parse(row.requested_start_utc)) {
        db.prepare("UPDATE booking_reminder_jobs SET status='cancelled' WHERE reminder_id=? AND status='pending'").run(row.reminder_id);
      } else {
        db.prepare("UPDATE booking_reminder_jobs SET due_at_utc=? WHERE reminder_id=? AND status='pending'").run(allowedAt, row.reminder_id);
      }
      return undefined;
    }
    const leaseToken = randomUUID();
    const result = db.prepare(`
      UPDATE booking_reminder_jobs SET status='processing',lease_token=?,lease_until_utc=?
      WHERE reminder_id=? AND status='pending'
    `).run(leaseToken, leaseUntil, row.reminder_id);
    if (result.changes !== 1) return undefined;
    return {
      reminderId: row.reminder_id, requestId: row.request_id, ownerId: row.owner_id, cadence: row.cadence,
      idempotencyKey: row.idempotency_key, dueAtUtc: row.due_at_utc,
      requestedStartUtc: row.requested_start_utc, ownerTimeZone: row.time_zone, leaseToken,
    };
  });
  return claim.immediate();
}

/** Completes only the job held by this lease; delivery integrations call this after durable handoff. */
export function completeClaimedBookingReminderJob(db: Database.Database, reminderId: string, leaseToken: string, now = new Date()): boolean {
  return db.prepare(`
    UPDATE booking_reminder_jobs SET status='completed',completed_at_utc=?,lease_token=NULL,lease_until_utc=NULL
    WHERE reminder_id=? AND status='processing' AND lease_token=?
      AND request_id IN (SELECT request_id FROM booking_requests WHERE status='pending' AND requested_start_utc>?)
  `).run(timestamp(now), reminderId, leaseToken, timestamp(now)).changes === 1;
}

export function releaseClaimedBookingReminderJob(
  db: Database.Database, reminderId: string, leaseToken: string, retryAt: Date,
): boolean {
  return db.prepare(`
    UPDATE booking_reminder_jobs SET status='pending',due_at_utc=?,lease_token=NULL,lease_until_utc=NULL
    WHERE reminder_id=? AND status='processing' AND lease_token=?
  `).run(timestamp(retryAt), reminderId, leaseToken).changes === 1;
}

/** Cancels unsent/leased jobs in the same decision transaction as request finalization. */
export function cancelBookingReminderJobsForRequest(db: Database.Database, requestId: string): number {
  return db.prepare(`
    UPDATE booking_reminder_jobs SET status='cancelled',lease_token=NULL,lease_until_utc=NULL
    WHERE request_id=? AND status IN ('pending','processing')
  `).run(requestId).changes;
}
