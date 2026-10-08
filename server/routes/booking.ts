import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { Temporal } from "@js-temporal/polyfill";
import type { BookingEmailDispatcher } from "../email/bookingConfirmation";
import { getBookingEmailDeliveryState, type BookingEmailDeliveryState } from "../db/repositories/bookingEmails";
import {
  createBookingLinkId,
  parseBookingLinkId,
  validateAvailabilityConfiguration,
  type BookingRequestStatus,
  type OwnerAvailabilityConfiguration,
} from "../../src/domain/booking";
import {
  BookingLinkOwnershipError,
  BookingRequestConflictError,
  BookingRequestNotFoundError,
  createPendingBookingRequest,
  decideOwnerBookingRequest,
  getBookingLinkContext,
  getOwnerBookingConfiguration,
  isBookingTimeAvailable,
  listConfirmedAppointmentProjections,
  listOwnerBookingRequests,
  saveBookingLinkConfiguration,
} from "../db/repositories/bookings";

export interface BookingRouteOptions {
  developmentAuth: boolean;
  now?: () => Date;
  emailDispatcher?: BookingEmailDispatcher;
}

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}
function parseInstant(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}

function ownerIdFromRequest(
  request: { headers: Record<string, string | string[] | undefined> },
  reply: { code: (status: number) => { send: (payload: unknown) => unknown } },
  enabled: boolean,
): string | undefined {
  if (!enabled || process.env.NODE_ENV === "production") {
    reply.code(503).send({ code: "owner_auth_unavailable" });
    return undefined;
  }
  const header = request.headers["x-lxnoro-dev-owner-id"];
  const ownerId = typeof header === "string" ? header.trim() : "";
  if (!ownerId || ownerId.length > 128) {
    reply.code(401).send({ code: "owner_auth_required" });
    return undefined;
  }
  return ownerId;
}

function parseConfiguration(value: unknown): OwnerAvailabilityConfiguration {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "bookingLinkId", "enabled", "allowedDurationsMinutes", "windows", "minimumNoticeMinutes",
    "maximumAdvanceMinutes", "bufferBeforeMinutes", "bufferAfterMinutes", "timeZone", "expiresAtUtc",
  ])) throw new RangeError("Invalid booking configuration");
  const linkId = value.bookingLinkId === undefined ? createBookingLinkId() : parseBookingLinkId(value.bookingLinkId);
  if (typeof value.enabled !== "boolean" || typeof value.timeZone !== "string" ||
      !Array.isArray(value.allowedDurationsMinutes) || !Array.isArray(value.windows) ||
      !Number.isSafeInteger(value.minimumNoticeMinutes) || !Number.isSafeInteger(value.bufferBeforeMinutes) ||
      !Number.isSafeInteger(value.bufferAfterMinutes) ||
      (value.maximumAdvanceMinutes !== undefined && !Number.isSafeInteger(value.maximumAdvanceMinutes)) ||
      (value.expiresAtUtc !== undefined && typeof value.expiresAtUtc !== "string")) {
    throw new RangeError("Invalid booking configuration");
  }
  const windows = value.windows.map((item) => {
    if (!isRecord(item) || !hasOnlyKeys(item, ["weekday", "startLocal", "endLocal"]) ||
        !Number.isInteger(item.weekday) || typeof item.startLocal !== "string" || typeof item.endLocal !== "string") {
      throw new RangeError("Invalid booking availability window");
    }
    return { weekday: item.weekday as number, startLocal: item.startLocal, endLocal: item.endLocal };
  });
  if (value.allowedDurationsMinutes.some((duration) => !Number.isSafeInteger(duration))) {
    throw new RangeError("Invalid allowed appointment duration");
  }
  const configuration: OwnerAvailabilityConfiguration = {
    bookingLinkId: linkId,
    enabled: value.enabled,
    allowedDurationsMinutes: value.allowedDurationsMinutes as number[],
    windows,
    minimumNoticeMinutes: value.minimumNoticeMinutes as number,
    ...(value.maximumAdvanceMinutes === undefined ? {} : { maximumAdvanceMinutes: value.maximumAdvanceMinutes as number }),
    bufferBeforeMinutes: value.bufferBeforeMinutes as number,
    bufferAfterMinutes: value.bufferAfterMinutes as number,
    timeZone: value.timeZone,
    ...(value.expiresAtUtc === undefined ? {} : { expiresAtUtc: value.expiresAtUtc as string }),
  };
  validateAvailabilityConfiguration(configuration);
  return configuration;
}

function localTimeToInstant(date: Temporal.PlainDate, time: string, timeZone: string): Temporal.Instant {
  return Temporal.PlainDateTime.from(date.toString() + "T" + time).toZonedDateTime(timeZone, { disambiguation: "reject" }).toInstant();
}

function requestFitsConfiguredWindow(
  requestedStartUtc: string,
  requestedEndUtc: string,
  configuration: OwnerAvailabilityConfiguration,
): boolean {
  const start = Temporal.Instant.from(requestedStartUtc);
  const end = Temporal.Instant.from(requestedEndUtc);
  const localStart = start.toZonedDateTimeISO(configuration.timeZone);
  return configuration.windows.some((window) => {
    if (window.weekday !== localStart.dayOfWeek) return false;
    try {
      const windowStart = localTimeToInstant(localStart.toPlainDate(), window.startLocal, configuration.timeZone);
      const windowEnd = localTimeToInstant(localStart.toPlainDate(), window.endLocal, configuration.timeZone);
      return Temporal.Instant.compare(start, windowStart) >= 0 && Temporal.Instant.compare(end, windowEnd) <= 0;
    } catch {
      return false;
    }
  });
}

function enumerateAvailableSlots(
  db: Database.Database,
  ownerId: string,
  configuration: OwnerAvailabilityConfiguration,
  fromUtc: string,
  toUtc: string,
  now: Date,
): Array<{ startUtc: string; endUtc: string; durationMinutes: number }> {
  const from = Temporal.Instant.from(fromUtc);
  const to = Temporal.Instant.from(toUtc);
  const firstDate = from.toZonedDateTimeISO(configuration.timeZone).toPlainDate();
  const lastDate = to.subtract({ nanoseconds: 1 }).toZonedDateTimeISO(configuration.timeZone).toPlainDate();
  const slots: Array<{ startUtc: string; endUtc: string; durationMinutes: number }> = [];
  const minStart = now.getTime() + configuration.minimumNoticeMinutes * 60_000;
  const maxStart = configuration.maximumAdvanceMinutes === undefined
    ? Number.POSITIVE_INFINITY
    : now.getTime() + configuration.maximumAdvanceMinutes * 60_000;
  const linkExpiry = configuration.expiresAtUtc ? Date.parse(configuration.expiresAtUtc) : Number.POSITIVE_INFINITY;

  for (let date = firstDate; Temporal.PlainDate.compare(date, lastDate) <= 0; date = date.add({ days: 1 })) {
    for (const window of configuration.windows.filter((candidate) => candidate.weekday === date.dayOfWeek)) {
      const [startHour, startMinute] = window.startLocal.split(":").map(Number);
      const [endHour, endMinute] = window.endLocal.split(":").map(Number);
      const windowStart = (startHour ?? 0) * 60 + (startMinute ?? 0);
      const windowEnd = (endHour ?? 0) * 60 + (endMinute ?? 0);
      for (let minute = windowStart; minute < windowEnd; minute += 15) {
        let startInstant: Temporal.Instant;
        try {
          const hour = String(Math.floor(minute / 60)).padStart(2, "0");
          const mins = String(minute % 60).padStart(2, "0");
          startInstant = localTimeToInstant(date, hour + ":" + mins, configuration.timeZone);
        } catch {
          // Ambiguous and nonexistent DST wall times are omitted rather than guessed.
          continue;
        }
        const startMs = Number(startInstant.epochMilliseconds);
        if (startMs < Number(from.epochMilliseconds) || startMs >= Number(to.epochMilliseconds) ||
            startMs < minStart || startMs > maxStart || startMs >= linkExpiry) continue;
        for (const durationMinutes of configuration.allowedDurationsMinutes) {
          if (minute + durationMinutes > windowEnd) continue;
          const endInstant = startInstant.add({ minutes: durationMinutes });
          const endMs = Number(endInstant.epochMilliseconds);
          if (endMs > Number(to.epochMilliseconds) || endMs >= linkExpiry) continue;
          const startUtc = startInstant.toString({ fractionalSecondDigits: 3 });
          const endUtc = endInstant.toString({ fractionalSecondDigits: 3 });
          if (!isBookingTimeAvailable(db, ownerId, startUtc, endUtc, configuration)) continue;
          slots.push({ startUtc, endUtc, durationMinutes });
          if (slots.length >= 10_000) return slots;
        }
      }
    }
  }
  return slots;
}

function parseRequesterSubmission(value: unknown) {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "requesterName", "requesterEmail", "requesterNote", "requestedStartUtc", "requestedEndUtc", "durationMinutes",
  ]) || typeof value.requesterName !== "string" || typeof value.requesterEmail !== "string" ||
      (value.requesterNote !== undefined && typeof value.requesterNote !== "string") ||
      !parseInstant(value.requestedStartUtc) || !parseInstant(value.requestedEndUtc) ||
      !Number.isSafeInteger(value.durationMinutes)) throw new RangeError("Invalid booking request");
  if (value.requesterName.length > 200 || value.requesterEmail.length > 320 ||
      (typeof value.requesterNote === "string" && value.requesterNote.length > 2000)) throw new RangeError("Invalid booking request");
  return {
    requesterName: value.requesterName,
    requesterEmail: value.requesterEmail,
    ...(typeof value.requesterNote === "string" ? { requesterNote: value.requesterNote } : {}),
    requestedStartUtc: value.requestedStartUtc,
    requestedEndUtc: value.requestedEndUtc,
    durationMinutes: value.durationMinutes as number,
  };
}

export function registerBookingRoutes(app: FastifyInstance, db: Database.Database, options: BookingRouteOptions): void {
  const now = options.now ?? (() => new Date());
  app.get("/api/owner/booking/configuration", async (request, reply) => {
    const ownerId = ownerIdFromRequest(request, reply, options.developmentAuth);
    if (!ownerId) return;
    const configuration = getOwnerBookingConfiguration(db, ownerId);
    if (!configuration) return reply.code(404).send({ code: "booking_configuration_not_found" });
    return reply.send({
      enabled: configuration.enabled,
      allowedDurationsMinutes: configuration.allowedDurationsMinutes,
      windows: configuration.windows,
      minimumNoticeMinutes: configuration.minimumNoticeMinutes,
      maximumAdvanceMinutes: configuration.maximumAdvanceMinutes ?? null,
      bufferBeforeMinutes: configuration.bufferBeforeMinutes,
      bufferAfterMinutes: configuration.bufferAfterMinutes,
      timeZone: configuration.timeZone,
      expiresAtUtc: configuration.expiresAtUtc ?? null,
    });
  });
  app.put("/api/owner/booking/configuration", async (request, reply) => {
    const ownerId = ownerIdFromRequest(request, reply, options.developmentAuth);
    if (!ownerId) return;
    try {
      const configuration = parseConfiguration(request.body);
      saveBookingLinkConfiguration(db, ownerId, configuration, now());
      return reply.code(200).send({
        bookingLinkId: configuration.bookingLinkId,
        enabled: configuration.enabled,
        allowedDurationsMinutes: configuration.allowedDurationsMinutes,
        windows: configuration.windows,
        minimumNoticeMinutes: configuration.minimumNoticeMinutes,
        maximumAdvanceMinutes: configuration.maximumAdvanceMinutes ?? null,
        bufferBeforeMinutes: configuration.bufferBeforeMinutes,
        bufferAfterMinutes: configuration.bufferAfterMinutes,
        timeZone: configuration.timeZone,
        expiresAtUtc: configuration.expiresAtUtc ?? null,
      });
    } catch (error) {
      if (error instanceof BookingLinkOwnershipError) return reply.code(409).send({ code: error.code });
      if (error instanceof RangeError || error instanceof TypeError) return reply.code(400).send({ code: "invalid_booking_configuration" });
      request.log.error({ err: error }, "Booking configuration save failed");
      return reply.code(500).send({ code: "booking_configuration_failed" });
    }
  });

  app.get("/api/owner/booking/requests", async (request, reply) => {
    const ownerId = ownerIdFromRequest(request, reply, options.developmentAuth);
    if (!ownerId) return;
    const status = (request.query as { status?: string }).status ?? "pending";
    if (!["pending", "approved", "rejected"].includes(status)) return reply.code(400).send({ code: "invalid_status" });
    return reply.send({ requests: listOwnerBookingRequests(db, ownerId, status as BookingRequestStatus) });
  });

  app.get("/api/owner/booking/appointments", async (request, reply) => {
    const ownerId = ownerIdFromRequest(request, reply, options.developmentAuth);
    if (!ownerId) return;
    return reply.send({ appointments: listConfirmedAppointmentProjections(db, ownerId) });
  });

  app.post<{ Params: { requestId: string } }>("/api/owner/booking/requests/:requestId/decision", async (request, reply) => {
    const ownerId = ownerIdFromRequest(request, reply, options.developmentAuth);
    if (!ownerId) return;
    if (!/^[0-9a-f-]{36}$/i.test(request.params.requestId) || !isRecord(request.body) ||
        !hasOnlyKeys(request.body, ["decision"]) ||
        (request.body.decision !== "approved" && request.body.decision !== "rejected")) {
      return reply.code(400).send({ code: "invalid_booking_decision" });
    }
    try {
      const result = decideOwnerBookingRequest(db, ownerId, request.params.requestId, request.body.decision, now());
      let emailDelivery: BookingEmailDeliveryState | undefined;
      if (request.body.decision === "approved") {
        try {
          emailDelivery = await options.emailDispatcher?.deliverRequestNow(result.id);
        } catch {
          // Appointment approval has committed; delivery/status failures cannot reverse it.
        }
      }
      let savedEmailState: BookingEmailDeliveryState | undefined;
      if (request.body.decision === "approved" && !emailDelivery) {
        try { savedEmailState = getBookingEmailDeliveryState(db, result.id); } catch { /* keep approval response successful */ }
      }
      return reply.send({
        request: result,
        ...(request.body.decision === "approved"
          ? { confirmationEmail: emailDelivery ?? savedEmailState ?? { status: "pending", lastErrorCode: "delivery_status_unavailable" } }
          : {}),
      });
    } catch (error) {
      if (error instanceof BookingRequestNotFoundError) return reply.code(404).send({ code: error.code });
      if (error instanceof BookingRequestConflictError) return reply.code(409).send({ code: error.code });
      if (error instanceof RangeError) return reply.code(409).send({ code: "booking_request_not_pending" });
      request.log.error({ err: error }, "Booking request decision failed");
      return reply.code(500).send({ code: "booking_decision_failed" });
    }
  });

  app.get<{ Params: { linkId: string }; Querystring: { fromUtc?: string; toUtc?: string } }>(
    "/api/public/booking/:linkId/availability", async (request, reply) => {
      try {
        const context = getBookingLinkContext(db, request.params.linkId);
        if (!context || !context.configuration.enabled) return reply.code(404).send({ code: "booking_unavailable" });
        if (!parseInstant(request.query.fromUtc) || !parseInstant(request.query.toUtc)) {
          return reply.code(400).send({ code: "invalid_availability_range" });
        }
        const fromMs = Date.parse(request.query.fromUtc);
        const toMs = Date.parse(request.query.toUtc);
        if (toMs <= fromMs || toMs - fromMs > 31 * 86_400_000) return reply.code(400).send({ code: "invalid_availability_range" });
        if (context.configuration.expiresAtUtc && Date.parse(context.configuration.expiresAtUtc) <= now().getTime()) {
          return reply.code(404).send({ code: "booking_unavailable" });
        }
        const slots = enumerateAvailableSlots(db, context.ownerId, context.configuration, request.query.fromUtc, request.query.toUtc, now());
        return reply.send({ timeZone: context.configuration.timeZone, availableSlots: slots });
      } catch (error) {
        if (error instanceof RangeError || error instanceof TypeError) return reply.code(400).send({ code: "invalid_booking_link_or_range" });
        request.log.error({ err: error }, "Public availability lookup failed");
        return reply.code(500).send({ code: "availability_unavailable" });
      }
    },
  );

  app.post<{ Params: { linkId: string } }>("/api/public/booking/:linkId/requests", async (request, reply) => {
    try {
      const submission = parseRequesterSubmission(request.body);
      const context = getBookingLinkContext(db, request.params.linkId);
      if (!context || !context.configuration.enabled) return reply.code(404).send({ code: "booking_unavailable" });
      if (!requestFitsConfiguredWindow(submission.requestedStartUtc, submission.requestedEndUtc, context.configuration)) {
        return reply.code(400).send({ code: "invalid_booking_request" });
      }
      const saved = createPendingBookingRequest(db, request.params.linkId, submission, now());
      return reply.code(201).send({ requestId: saved.id, status: saved.status });
    } catch (error) {
      if (error instanceof BookingRequestConflictError) return reply.code(409).send({ code: "slot_unavailable" });
      if (error instanceof BookingRequestNotFoundError) return reply.code(404).send({ code: "booking_unavailable" });
      if (error instanceof RangeError || error instanceof TypeError) return reply.code(400).send({ code: "invalid_booking_request" });
      request.log.error({ err: error }, "Public booking request creation failed");
      return reply.code(500).send({ code: "booking_request_failed" });
    }
  });
}
