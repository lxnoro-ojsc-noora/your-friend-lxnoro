import { createHash, randomBytes, randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { cancelBookingReminderJobsForRequest, insertBookingReminderJobsForPendingRequest } from "./bookingReminders";
import {
  parseBookingLinkId,
  isBookingProjectionFresh,
  validateBookingAlternative,
  validateAvailabilityConfiguration,
  validateBookingRequestSubmission,
  respondToBookingAlternative as applyAlternativeResponse,
  type BookingAlternativeInput,
  type BookingAlternativeProposal,
  type BookingLinkId,
  type BookingRequestSubmission,
  type BookingRequestStatus,
  type OwnerAvailabilityConfiguration,
} from "../../../src/domain/booking";

export interface StoredBookingRequest extends BookingRequestSubmission {
  id: string;
  ownerId: string;
  status: BookingRequestStatus;
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface StoredConfirmedAppointment {
  id: string;
  requestId: string;
  ownerId: string;
  startUtc: string;
  endUtc: string;
  durationMinutes: number;
  createdAtUtc: string;
}

export interface ConfirmedAppointmentProjection {
  id: string;
  startUtc: string;
  endUtc: string;
  durationMinutes: number;
  timeZone: string;
}

export interface CreatedBookingAlternative {
  proposal: BookingAlternativeProposal;
  /** Returned to the requester once; only its hash is persisted. */
  responseKey: string;
}

export class BookingRequestConflictError extends Error {
  readonly code = "booking_conflict";
}

export class BookingRequestNotFoundError extends Error {
  readonly code = "booking_request_not_found";
}

export class BookingLinkOwnershipError extends Error {
  readonly code = "booking_link_owner_mismatch";
}

export class BookingAlternativeNotFoundError extends Error {
  readonly code = "booking_alternative_not_found";
}

export class BookingAlternativeConflictError extends Error {
  readonly code = "booking_alternative_state_conflict";
}

export class BookingProjectionUnavailableError extends Error {
  readonly code = "booking_projection_unavailable";
}

export class BookingProjectionStaleError extends Error {
  readonly code = "booking_projection_stale";
}

function tokenHash(linkId: BookingLinkId | string): string {
  const validId = parseBookingLinkId(linkId);
  return createHash("sha256").update(validId, "utf8").digest("hex");
}

function utcNow(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Current time is invalid");
  return now.toISOString();
}

function createAlternativeResponseKey(): string {
  return randomBytes(24).toString("base64url");
}

function alternativeKeyHash(key: string): string {
  if (!/^[A-Za-z0-9_-]{32}$/.test(key)) throw new BookingAlternativeNotFoundError("Alternative response was not found");
  return createHash("sha256").update(key, "utf8").digest("hex");
}

function mapAlternative(row: Record<string, unknown>): BookingAlternativeProposal {
  return {
    id: row.proposal_id as string,
    requestId: row.request_id as string,
    proposedDate: row.proposed_date as string,
    proposedStartTime: row.proposed_start_local as string,
    startUtc: row.start_utc as string,
    endUtc: row.end_utc as string,
    durationMinutes: row.duration_minutes as number,
    timeZone: row.time_zone as string,
    status: row.status as BookingAlternativeProposal["status"],
    createdAtUtc: row.created_at_utc as string,
    ...(row.responded_at_utc === null ? {} : { respondedAtUtc: row.responded_at_utc as string }),
    ...(Number.isSafeInteger(row.confirmed_projection_revision) ? { confirmedProjectionRevision: row.confirmed_projection_revision as number } : {}),
  };
}

function readConfiguration(db: Database.Database, hash: string, linkId: BookingLinkId): OwnerAvailabilityConfiguration | undefined {
  const link = db.prepare(`
    SELECT owner_id, enabled, expires_at_utc FROM booking_links WHERE link_id_hash = ?
  `).get(hash) as { owner_id: string; enabled: number; expires_at_utc: string | null } | undefined;
  if (!link) return undefined;
  const availability = db.prepare(`
    SELECT minimum_notice_minutes, maximum_advance_minutes, buffer_before_minutes,
      buffer_after_minutes, time_zone FROM booking_availability WHERE link_id_hash = ?
  `).get(hash) as {
    minimum_notice_minutes: number; maximum_advance_minutes: number | null;
    buffer_before_minutes: number; buffer_after_minutes: number; time_zone: string;
  } | undefined;
  if (!availability) return undefined;
  const durations = db.prepare("SELECT duration_minutes FROM booking_allowed_durations WHERE link_id_hash = ? ORDER BY duration_minutes").all(hash) as Array<{ duration_minutes: number }>;
  const windows = db.prepare("SELECT weekday, start_local, end_local FROM booking_availability_windows WHERE link_id_hash = ? ORDER BY weekday, start_local").all(hash) as Array<{ weekday: number; start_local: string; end_local: string }>;
  return {
    bookingLinkId: linkId,
    enabled: link.enabled === 1,
    allowedDurationsMinutes: durations.map(({ duration_minutes }) => duration_minutes),
    windows: windows.map(({ weekday, start_local, end_local }) => ({ weekday, startLocal: start_local, endLocal: end_local })),
    minimumNoticeMinutes: availability.minimum_notice_minutes,
    ...(availability.maximum_advance_minutes === null ? {} : { maximumAdvanceMinutes: availability.maximum_advance_minutes }),
    bufferBeforeMinutes: availability.buffer_before_minutes,
    bufferAfterMinutes: availability.buffer_after_minutes,
    timeZone: availability.time_zone,
    ...(link.expires_at_utc === null ? {} : { expiresAtUtc: link.expires_at_utc }),
  };
}

/** Persist link policy while storing only a one-way hash of the public bearer token. */
export function saveBookingLinkConfiguration(
  db: Database.Database,
  ownerId: string,
  configuration: OwnerAvailabilityConfiguration,
  now = new Date(),
): void {
  if (!ownerId.trim() || ownerId.length > 128) throw new RangeError("Owner identity is invalid");
  const linkId = parseBookingLinkId(configuration.bookingLinkId);
  validateAvailabilityConfiguration(configuration);
  const hash = tokenHash(linkId);
  const timestamp = utcNow(now);
  const save = db.transaction(() => {
    const existing = db.prepare("SELECT owner_id FROM booking_links WHERE link_id_hash = ?").get(hash) as { owner_id: string } | undefined;
    if (existing && existing.owner_id !== ownerId) throw new BookingLinkOwnershipError("Booking link belongs to another owner");
    db.prepare(`
      INSERT INTO booking_links (link_id_hash, owner_id, enabled, expires_at_utc, created_at_utc, updated_at_utc)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(link_id_hash) DO UPDATE SET owner_id = excluded.owner_id, enabled = excluded.enabled,
        expires_at_utc = excluded.expires_at_utc, updated_at_utc = excluded.updated_at_utc
    `).run(hash, ownerId, Number(configuration.enabled), configuration.expiresAtUtc ?? null, timestamp, timestamp);
    db.prepare(`
      INSERT INTO booking_availability (link_id_hash, minimum_notice_minutes, maximum_advance_minutes,
        buffer_before_minutes, buffer_after_minutes, time_zone)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(link_id_hash) DO UPDATE SET minimum_notice_minutes = excluded.minimum_notice_minutes,
        maximum_advance_minutes = excluded.maximum_advance_minutes, buffer_before_minutes = excluded.buffer_before_minutes,
        buffer_after_minutes = excluded.buffer_after_minutes, time_zone = excluded.time_zone
    `).run(hash, configuration.minimumNoticeMinutes, configuration.maximumAdvanceMinutes ?? null,
      configuration.bufferBeforeMinutes, configuration.bufferAfterMinutes, configuration.timeZone);
    db.prepare("DELETE FROM booking_allowed_durations WHERE link_id_hash = ?").run(hash);
    db.prepare("DELETE FROM booking_availability_windows WHERE link_id_hash = ?").run(hash);
    const addDuration = db.prepare("INSERT INTO booking_allowed_durations (link_id_hash, duration_minutes) VALUES (?, ?)");
    for (const duration of configuration.allowedDurationsMinutes) addDuration.run(hash, duration);
    const addWindow = db.prepare("INSERT INTO booking_availability_windows (link_id_hash, weekday, start_local, end_local) VALUES (?, ?, ?, ?)");
    for (const window of configuration.windows) addWindow.run(hash, window.weekday, window.startLocal, window.endLocal);
  });
  save.immediate();
}

/** Resolve a share token by its one-way hash; never query using schedule contents. */
export function getBookingLinkConfiguration(db: Database.Database, suppliedLinkId: string): OwnerAvailabilityConfiguration | undefined {
  const linkId = parseBookingLinkId(suppliedLinkId);
  return readConfiguration(db, tokenHash(linkId), linkId);
}

/** Return the owner's active-link policy without revealing the bearer token. */
export function getOwnerBookingConfiguration(db: Database.Database, ownerId: string): Omit<OwnerAvailabilityConfiguration, "bookingLinkId"> | undefined {
  const row = db.prepare("SELECT link_id_hash FROM booking_links WHERE owner_id = ? ORDER BY updated_at_utc DESC LIMIT 1").get(ownerId) as { link_id_hash: string } | undefined;
  if (!row) return undefined;
  const config = readConfiguration(db, row.link_id_hash, "" as BookingLinkId);
  if (!config) return undefined;
  const { bookingLinkId: _token, ...safe } = config;
  return safe;
}

export function getBookingLinkContext(db: Database.Database, suppliedLinkId: string): { ownerId: string; configuration: OwnerAvailabilityConfiguration } | undefined {
  const linkId = parseBookingLinkId(suppliedLinkId);
  const hash = tokenHash(linkId);
  const row = db.prepare("SELECT owner_id FROM booking_links WHERE link_id_hash = ?").get(hash) as { owner_id: string } | undefined;
  const configuration = readConfiguration(db, hash, linkId);
  return row && configuration ? { ownerId: row.owner_id, configuration } : undefined;
}

function hasConflict(
  db: Database.Database,
  ownerId: string,
  startUtc: string,
  endUtc: string,
  bufferBeforeMinutes: number,
  bufferAfterMinutes: number,
  excludeRequestId?: string,
): boolean {
  const start = Date.parse(startUtc) - bufferBeforeMinutes * 60_000;
  const end = Date.parse(endUtc) + bufferAfterMinutes * 60_000;
  const startBound = new Date(start).toISOString();
  const endBound = new Date(end).toISOString();
  const busy = db.prepare(`SELECT 1 FROM busy_intervals WHERE owner_id = ? AND start_utc < ? AND end_utc > ? LIMIT 1`).get(ownerId, endBound, startBound);
  if (busy) return true;
  const confirmed = db.prepare(`SELECT 1 FROM confirmed_appointments WHERE owner_id = ? AND start_utc < ? AND end_utc > ? LIMIT 1`).get(ownerId, endBound, startBound);
  if (confirmed) return true;
  return Boolean(db.prepare(`
    SELECT 1 FROM booking_requests
    WHERE owner_id = ? AND status = 'pending' AND request_id != ?
      AND requested_start_utc < ? AND requested_end_utc > ? LIMIT 1
  `).get(ownerId, excludeRequestId ?? "", endBound, startBound));
}

export function isBookingTimeAvailable(
  db: Database.Database,
  ownerId: string,
  startUtc: string,
  endUtc: string,
  configuration: OwnerAvailabilityConfiguration,
  excludeRequestId?: string,
): boolean {
  return !hasConflict(db, ownerId, startUtc, endUtc, configuration.bufferBeforeMinutes,
    configuration.bufferAfterMinutes, excludeRequestId);
}

function mapRequest(row: Record<string, unknown>): StoredBookingRequest {
  return {
    id: row.request_id as string,
    ownerId: row.owner_id as string,
    requesterName: row.requester_name as string,
    requesterEmail: row.requester_email as string,
    ...(row.requester_note === null ? {} : { requesterNote: row.requester_note as string }),
    requestedStartUtc: row.requested_start_utc as string,
    requestedEndUtc: row.requested_end_utc as string,
    durationMinutes: row.duration_minutes as number,
    status: row.status as BookingRequestStatus,
    createdAtUtc: row.created_at_utc as string,
    updatedAtUtc: row.updated_at_utc as string,
  };
}

export function createPendingBookingRequest(
  db: Database.Database,
  suppliedLinkId: string,
  submission: BookingRequestSubmission,
  now = new Date(),
): StoredBookingRequest {
  const linkId = parseBookingLinkId(suppliedLinkId);
  const hash = tokenHash(linkId);
  const createdAtUtc = utcNow(now);
  const id = randomUUID();
  const create = db.transaction(() => {
    const link = db.prepare("SELECT owner_id, enabled, expires_at_utc FROM booking_links WHERE link_id_hash = ?").get(hash) as
      { owner_id: string; enabled: number; expires_at_utc: string | null } | undefined;
    const configuration = readConfiguration(db, hash, linkId);
    if (!link || !configuration || !link.enabled) throw new BookingRequestNotFoundError("Booking link is unavailable");
    validateBookingRequestSubmission(submission, configuration, now);
    if (hasConflict(db, link.owner_id, submission.requestedStartUtc, submission.requestedEndUtc,
      configuration.bufferBeforeMinutes, configuration.bufferAfterMinutes)) {
      throw new BookingRequestConflictError("Requested time is unavailable");
    }
    db.prepare(`
      INSERT INTO booking_requests (request_id, link_id_hash, owner_id, requester_name, requester_email,
        requester_note, requested_start_utc, requested_end_utc, duration_minutes, status, created_at_utc, updated_at_utc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(id, hash, link.owner_id, submission.requesterName.trim(), submission.requesterEmail.trim(),
      submission.requesterNote ?? null, submission.requestedStartUtc, submission.requestedEndUtc,
      submission.durationMinutes, createdAtUtc, createdAtUtc);
    insertBookingReminderJobsForPendingRequest(db, id, now);
    return mapRequest(db.prepare("SELECT * FROM booking_requests WHERE request_id = ?").get(id) as Record<string, unknown>);
  });
  return create.immediate();
}

export function listOwnerBookingRequests(db: Database.Database, ownerId: string, status?: BookingRequestStatus): StoredBookingRequest[] {
  const rows = status
    ? db.prepare("SELECT * FROM booking_requests WHERE owner_id = ? AND status = ? ORDER BY requested_start_utc").all(ownerId, status)
    : db.prepare("SELECT * FROM booking_requests WHERE owner_id = ? ORDER BY requested_start_utc").all(ownerId);
  return (rows as Array<Record<string, unknown>>).map(mapRequest);
}

/** Save one owner-proposed alternative while preserving the original request and proposal history. */
export function createBookingAlternativeProposal(
  db: Database.Database,
  ownerId: string,
  requestId: string,
  input: BookingAlternativeInput,
  now = new Date(),
): CreatedBookingAlternative {
  if (!ownerId.trim() || ownerId.length > 128) throw new RangeError("Owner identity is invalid");
  const timestamp = utcNow(now);
  const responseKey = createAlternativeResponseKey();
  const responseKeyHash = alternativeKeyHash(responseKey);
  const proposalId = randomUUID();
  const create = db.transaction(() => {
    const request = db.prepare("SELECT * FROM booking_requests WHERE request_id = ? AND owner_id = ?")
      .get(requestId, ownerId) as Record<string, unknown> | undefined;
    if (!request) throw new BookingRequestNotFoundError("Booking request was not found");
    if (request.status !== "pending") throw new RangeError("Only pending booking requests can receive an alternative");
    const linkHash = request.link_id_hash as string;
    const configuration = readConfiguration(db, linkHash, "" as BookingLinkId);
    if (!configuration) throw new BookingRequestNotFoundError("Booking policy was not found");
    const interval = validateBookingAlternative(input, {
      requesterName: request.requester_name as string,
      requesterEmail: request.requester_email as string,
      ...(request.requester_note === null ? {} : { requesterNote: request.requester_note as string }),
    }, configuration, now);
    const prior = db.prepare("SELECT 1 FROM booking_alternative_proposals WHERE request_id = ? AND status IN ('proposed', 'accepted') LIMIT 1")
      .get(requestId);
    if (prior) throw new BookingAlternativeConflictError("An alternative is already awaiting response or finalization");
    db.prepare(`
      INSERT INTO booking_alternative_proposals
        (proposal_id, request_id, response_key_hash, proposed_date, proposed_start_local,
         start_utc, end_utc, duration_minutes, time_zone, status, created_at_utc, responded_at_utc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed', ?, NULL)
    `).run(proposalId, requestId, responseKeyHash, interval.proposedDate, interval.proposedStartTime,
      interval.startUtc, interval.endUtc, interval.durationMinutes, interval.timeZone, timestamp);
    const row = db.prepare("SELECT * FROM booking_alternative_proposals WHERE proposal_id = ?").get(proposalId) as Record<string, unknown>;
    return mapAlternative(row);
  });
  return { proposal: create.immediate(), responseKey };
}

/** Owner history contains proposal data only; no requester or private schedule details are joined. */
export function listBookingAlternativeProposals(
  db: Database.Database,
  ownerId: string,
  requestId: string,
): BookingAlternativeProposal[] {
  const rows = db.prepare(`
    SELECT proposal.* FROM booking_alternative_proposals AS proposal
    JOIN booking_requests AS request ON request.request_id = proposal.request_id
    WHERE request.owner_id = ? AND request.request_id = ?
    ORDER BY proposal.created_at_utc, proposal.proposal_id
  `).all(ownerId, requestId) as Array<Record<string, unknown>>;
  return rows.map(mapAlternative);
}

/** Record an explicit requester decision; replay with the same response key/decision is idempotent. */
export function recordBookingAlternativeResponse(
  db: Database.Database,
  responseKey: string,
  decision: "accepted" | "rejected",
  now = new Date(),
): BookingAlternativeProposal {
  const hash = alternativeKeyHash(responseKey);
  const timestamp = utcNow(now);
  const respond = db.transaction(() => {
    const row = db.prepare(`
      SELECT proposal.*, request.status AS request_status
      FROM booking_alternative_proposals AS proposal
      JOIN booking_requests AS request ON request.request_id = proposal.request_id
      WHERE proposal.response_key_hash = ?
    `)
      .get(hash) as Record<string, unknown> | undefined;
    if (!row) throw new BookingAlternativeNotFoundError("Alternative response was not found");
    const proposal = mapAlternative(row);
    if (proposal.status === decision) return proposal;
    if (proposal.status !== "proposed") throw new BookingAlternativeConflictError("Alternative already has a different final state");
    if (row.request_status !== "pending") throw new BookingAlternativeConflictError("The original booking request is no longer pending");
    const updated = applyAlternativeResponse(proposal, decision, timestamp);
    db.prepare("UPDATE booking_alternative_proposals SET status = ?, responded_at_utc = ? WHERE proposal_id = ? AND status = 'proposed'")
      .run(updated.status, timestamp, proposal.id);
    return updated;
  });
  return respond.immediate();
}

export interface AcceptedBookingAlternative {
  proposal: BookingAlternativeProposal;
  requestId: string;
  projectionRevision: number;
}

/** Finalize acceptance against the current synchronized interval snapshot in one write transaction. */
export function acceptBookingAlternativeAndConfirm(
  db: Database.Database,
  responseKey: string,
  now = new Date(),
): AcceptedBookingAlternative {
  const hash = alternativeKeyHash(responseKey);
  const timestamp = utcNow(now);
  const accept = db.transaction((): AcceptedBookingAlternative => {
    const row = db.prepare(`
      SELECT proposal.*, request.request_id AS parent_request_id, request.owner_id, request.status AS request_status,
        request.link_id_hash, link.expires_at_utc, availability.buffer_before_minutes,
        availability.buffer_after_minutes, availability.time_zone AS owner_time_zone,
        projection.source_revision, projection.updated_at AS projection_updated_at
      FROM booking_alternative_proposals AS proposal
      JOIN booking_requests AS request ON request.request_id = proposal.request_id
      JOIN booking_links AS link ON link.link_id_hash = request.link_id_hash
      JOIN booking_availability AS availability ON availability.link_id_hash = request.link_id_hash
      LEFT JOIN booking_projection_state AS projection ON projection.owner_id = request.owner_id
      WHERE proposal.response_key_hash = ?
    `).get(hash) as Record<string, unknown> | undefined;
    if (!row) throw new BookingAlternativeNotFoundError("Alternative response was not found");
    const proposal = mapAlternative(row);
    if (proposal.status !== "proposed") throw new BookingAlternativeConflictError("Alternative already has a final state");
    if (row.request_status !== "pending") throw new BookingAlternativeConflictError("The original booking request is no longer pending");
    if (Date.parse(proposal.startUtc) <= now.getTime() ||
        (row.expires_at_utc !== null && Date.parse(row.expires_at_utc as string) <= now.getTime())) {
      throw new BookingAlternativeConflictError("Alternative has expired");
    }
    const revision = row.source_revision;
    const updatedAt = row.projection_updated_at;
    if (!Number.isSafeInteger(revision) || (revision as number) <= 0 || typeof updatedAt !== "string") {
      throw new BookingProjectionUnavailableError("No synchronized owner booking projection is available");
    }
    if (!isBookingProjectionFresh(updatedAt, now)) {
      throw new BookingProjectionStaleError("The owner booking projection is stale");
    }
    if (proposal.timeZone !== row.owner_time_zone) {
      throw new BookingAlternativeConflictError("Alternative timezone no longer matches booking policy");
    }
    if (hasConflict(db, row.owner_id as string, proposal.startUtc, proposal.endUtc,
      row.buffer_before_minutes as number, row.buffer_after_minutes as number, row.parent_request_id as string)) {
      throw new BookingRequestConflictError("Alternative time is no longer available");
    }

    db.prepare(`
      UPDATE booking_alternative_proposals
      SET status = 'accepted', responded_at_utc = ?, confirmed_projection_revision = ?
      WHERE proposal_id = ? AND status = 'proposed'
    `).run(timestamp, revision, proposal.id);
    db.prepare(`
      INSERT INTO confirmed_appointments
        (appointment_id, request_id, owner_id, start_utc, end_utc, duration_minutes, time_zone, created_at_utc)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), row.parent_request_id, row.owner_id, proposal.startUtc, proposal.endUtc,
      proposal.durationMinutes, proposal.timeZone, timestamp);
    db.prepare(`
      INSERT INTO booking_email_deliveries
        (delivery_id, request_id, status, attempt_count, next_attempt_at_utc, created_at_utc, updated_at_utc)
      VALUES (?, ?, 'pending', 0, ?, ?, ?)
    `).run(randomUUID(), row.parent_request_id, timestamp, timestamp, timestamp);
    db.prepare("UPDATE booking_requests SET status = 'approved', updated_at_utc = ? WHERE request_id = ? AND status = 'pending'")
      .run(timestamp, row.parent_request_id);
    cancelBookingReminderJobsForRequest(db, row.parent_request_id as string);
    const acceptedRow = db.prepare("SELECT * FROM booking_alternative_proposals WHERE proposal_id = ?")
      .get(proposal.id) as Record<string, unknown>;
    return { proposal: mapAlternative(acceptedRow), requestId: row.parent_request_id as string, projectionRevision: revision as number };
  });
  return accept.immediate();
}

/** Atomically decide a pending request; approval rechecks current busy/confirmed/pending intervals. */
export function decideOwnerBookingRequest(
  db: Database.Database,
  ownerId: string,
  requestId: string,
  decision: "approved" | "rejected",
  now = new Date(),
): StoredBookingRequest {
  const timestamp = utcNow(now);
  const decide = db.transaction(() => {
    const row = db.prepare("SELECT * FROM booking_requests WHERE request_id = ? AND owner_id = ?").get(requestId, ownerId) as Record<string, unknown> | undefined;
    if (!row) throw new BookingRequestNotFoundError("Booking request was not found");
    if (row.status !== "pending") throw new RangeError("Only pending booking requests can be decided");
    if (decision === "approved") {
      const hash = row.link_id_hash as string;
      const availability = db.prepare(`
        SELECT buffer_before_minutes, buffer_after_minutes, time_zone FROM booking_availability WHERE link_id_hash = ?
      `).get(hash) as { buffer_before_minutes: number; buffer_after_minutes: number; time_zone: string } | undefined;
      if (!availability) throw new BookingRequestNotFoundError("Booking policy was not found");
      if (hasConflict(db, ownerId, row.requested_start_utc as string, row.requested_end_utc as string,
        availability.buffer_before_minutes, availability.buffer_after_minutes, requestId)) {
        throw new BookingRequestConflictError("Requested time is no longer available");
      }
      const appointmentId = randomUUID();
      db.prepare(`
        INSERT INTO confirmed_appointments (appointment_id, request_id, owner_id, start_utc, end_utc, duration_minutes, time_zone, created_at_utc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(appointmentId, requestId, ownerId, row.requested_start_utc, row.requested_end_utc, row.duration_minutes, availability.time_zone, timestamp);
      db.prepare(`
        INSERT INTO booking_email_deliveries
          (delivery_id, request_id, status, attempt_count, next_attempt_at_utc, created_at_utc, updated_at_utc)
        VALUES (?, ?, 'pending', 0, ?, ?, ?)
      `).run(randomUUID(), requestId, timestamp, timestamp, timestamp);
    }
    db.prepare("UPDATE booking_requests SET status = ?, updated_at_utc = ? WHERE request_id = ? AND status = 'pending'")
      .run(decision, timestamp, requestId);
    cancelBookingReminderJobsForRequest(db, requestId);
    return mapRequest(db.prepare("SELECT * FROM booking_requests WHERE request_id = ?").get(requestId) as Record<string, unknown>);
  });
  return decide.immediate();
}

export function listConfirmedAppointments(db: Database.Database, ownerId: string): StoredConfirmedAppointment[] {
  const rows = db.prepare(`SELECT * FROM confirmed_appointments WHERE owner_id = ? ORDER BY start_utc`).all(ownerId) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: row.appointment_id as string,
    requestId: row.request_id as string,
    ownerId: row.owner_id as string,
    startUtc: row.start_utc as string,
    endUtc: row.end_utc as string,
    durationMinutes: row.duration_minutes as number,
    createdAtUtc: row.created_at_utc as string,
  }));
}

/** The owner calendar projection contains only fields needed to place a confirmed block in time. */
export function listConfirmedAppointmentProjections(db: Database.Database, ownerId: string): ConfirmedAppointmentProjection[] {
  const rows = db.prepare(
    "SELECT appointment.appointment_id, appointment.start_utc, appointment.end_utc, " +
    "appointment.duration_minutes, appointment.time_zone " +
    "FROM confirmed_appointments AS appointment " +
    "JOIN booking_requests AS request ON request.request_id = appointment.request_id " +
    "WHERE appointment.owner_id = ? AND request.status = 'approved' ORDER BY appointment.start_utc",
  ).all(ownerId) as Array<{
    appointment_id: string; start_utc: string; end_utc: string; duration_minutes: number; time_zone: string;
  }>;
  return rows.map((row) => ({
    id: row.appointment_id,
    startUtc: row.start_utc,
    endUtc: row.end_utc,
    durationMinutes: row.duration_minutes,
    timeZone: row.time_zone,
  }));
}
