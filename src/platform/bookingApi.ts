import type { BookingProjectionV1 } from "../domain/bookingProjection";
import type { ServerBookingSnapshot } from "../data/bookingSync";
import type { ConfirmedAppointmentProjection } from "../domain/confirmedAppointment";

export interface BookingProjectionPublishResult {
  revision: number;
  intervalCount: number;
  updatedAt: string;
}

export class BookingApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`Booking projection publish failed (${code})`);
    this.name = "BookingApiError";
  }
}

export interface PublishBookingProjectionOptions {
  /** Local-only development identity; replace with the approved secure session when implemented. */
  developmentOwnerId: string;
  endpoint?: string;
  appointmentsEndpoint?: string;
  fetchImpl?: typeof fetch;
}

/** Transmits only the versioned interval projection; caller activity objects are never serialized. */
export async function publishBookingProjection(
  projection: BookingProjectionV1,
  options: PublishBookingProjectionOptions,
): Promise<BookingProjectionPublishResult> {
  const payload: BookingProjectionV1 = {
    schemaVersion: projection.schemaVersion,
    revision: projection.revision,
    coverageStartUtc: projection.coverageStartUtc,
    coverageEndUtc: projection.coverageEndUtc,
    intervals: projection.intervals.map(({ startUtc, endUtc }) => ({ startUtc, endUtc })),
  };
  const response = await (options.fetchImpl ?? fetch)(options.endpoint ?? "/api/owner/booking/busy-intervals", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-lxnoro-dev-owner-id": options.developmentOwnerId,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new BookingApiError(response.status, typeof result.code === "string" ? result.code : "request_failed");
  }
  if (result.revision !== projection.revision || result.intervalCount !== projection.intervals.length || typeof result.updatedAt !== "string") {
    throw new BookingApiError(response.status, "invalid_server_response");
  }
  return {
    revision: result.revision as number,
    intervalCount: result.intervalCount as number,
    updatedAt: result.updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
}

function validUtcInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

/** Fetches and strictly validates the owner's interval-only server snapshot. */
export async function fetchBookingProjectionSnapshot(
  options: PublishBookingProjectionOptions,
): Promise<ServerBookingSnapshot> {
  const response = await (options.fetchImpl ?? fetch)(options.endpoint ?? "/api/owner/booking/busy-intervals", {
    method: "GET",
    headers: { "x-lxnoro-dev-owner-id": options.developmentOwnerId },
  });
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new BookingApiError(response.status, "invalid_server_response");
  }
  if (!response.ok) {
    const code = isRecord(result) && typeof result.code === "string" ? result.code : "request_failed";
    throw new BookingApiError(response.status, code);
  }
  if (!isRecord(result) || !hasOnlyKeys(result, ["ownerId", "revision", "intervals", "syncStatus", "updatedAt"]) ||
      result.ownerId !== options.developmentOwnerId || !Number.isSafeInteger(result.revision) || (result.revision as number) < 0 ||
      result.syncStatus !== "synced" || !Array.isArray(result.intervals) || result.intervals.length > 10_000 ||
      !(result.updatedAt === null || validUtcInstant(result.updatedAt))) {
    throw new BookingApiError(response.status, "invalid_snapshot");
  }

  const intervals: ServerBookingSnapshot["intervals"] = [];
  let previousEnd = "";
  for (const interval of result.intervals) {
    if (!isRecord(interval) || !hasOnlyKeys(interval, ["startUtc", "endUtc"]) ||
        !validUtcInstant(interval.startUtc) || !validUtcInstant(interval.endUtc) || interval.startUtc >= interval.endUtc ||
        (previousEnd && interval.startUtc <= previousEnd)) {
      throw new BookingApiError(response.status, "invalid_snapshot");
    }
    intervals.push({ startUtc: interval.startUtc, endUtc: interval.endUtc });
    previousEnd = interval.endUtc;
  }

  return {
    ownerId: result.ownerId,
    revision: result.revision as number,
    intervals,
    syncStatus: "synced",
    updatedAt: result.updatedAt as string | null,
  };
}

/** Fetch only the confirmed appointment fields required to draw local calendar blocks. */
export async function fetchConfirmedAppointmentProjections(
  options: PublishBookingProjectionOptions,
): Promise<ConfirmedAppointmentProjection[]> {
  const response = await (options.fetchImpl ?? fetch)(options.appointmentsEndpoint ?? "/api/owner/booking/appointments", {
    method: "GET",
    headers: { "x-lxnoro-dev-owner-id": options.developmentOwnerId },
  });
  let result: unknown;
  try { result = await response.json(); }
  catch { throw new BookingApiError(response.status, "invalid_appointments_response"); }
  if (!response.ok) {
    const code = isRecord(result) && typeof result.code === "string" ? result.code : "request_failed";
    throw new BookingApiError(response.status, code);
  }
  if (!isRecord(result) || !hasOnlyKeys(result, ["appointments"]) ||
      !Array.isArray(result.appointments) || result.appointments.length > 10_000) {
    throw new BookingApiError(response.status, "invalid_appointments_response");
  }
  const appointments: ConfirmedAppointmentProjection[] = [];
  const seen = new Set<string>();
  for (const item of result.appointments) {
    if (!isRecord(item) || !hasOnlyKeys(item, ["id", "startUtc", "endUtc", "durationMinutes", "timeZone"]) ||
        typeof item.id !== "string" || !/^[0-9a-f-]{36}$/i.test(item.id) || seen.has(item.id) ||
        !validUtcInstant(item.startUtc) || !validUtcInstant(item.endUtc) ||
        !Number.isSafeInteger(item.durationMinutes) || (item.durationMinutes as number) <= 0 ||
        Date.parse(item.endUtc as string) - Date.parse(item.startUtc as string) !== (item.durationMinutes as number) * 60_000 ||
        typeof item.timeZone !== "string") {
      throw new BookingApiError(response.status, "invalid_appointments_response");
    }
    try { new Intl.DateTimeFormat("en", { timeZone: item.timeZone }); }
    catch { throw new BookingApiError(response.status, "invalid_appointments_response"); }
    seen.add(item.id);
    appointments.push({
      id: item.id,
      startUtc: item.startUtc,
      endUtc: item.endUtc,
      durationMinutes: item.durationMinutes as number,
      timeZone: item.timeZone,
    });
  }
  return appointments;
}
