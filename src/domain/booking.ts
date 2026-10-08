/** Network booking records deliberately contain no private schedule/activity fields. */
export type BookingRequestStatus = "pending" | "approved" | "rejected";

export interface BookingRequest {
  id: string;
  bookingLinkId: BookingLinkId;
  requesterName: string;
  requesterEmail: string;
  requesterNote?: string;
  requestedStartUtc: string;
  requestedEndUtc: string;
  durationMinutes: number;
  status: BookingRequestStatus;
  createdAtUtc: string;
}

/** Opaque bearer identifier for a public booking link; never encode owner or schedule data in it. */
export type BookingLinkId = string & { readonly __bookingLinkId: unique symbol };

export interface WeeklyAvailabilityWindow {
  /** ISO weekday: Monday=1 through Sunday=7. */
  weekday: number;
  startLocal: string;
  endLocal: string;
}

export interface OwnerAvailabilityConfiguration {
  bookingLinkId: BookingLinkId;
  enabled: boolean;
  allowedDurationsMinutes: number[];
  windows: WeeklyAvailabilityWindow[];
  minimumNoticeMinutes: number;
  maximumAdvanceMinutes?: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  timeZone: string;
  expiresAtUtc?: string;
}

export interface BookingRequestSubmission {
  requesterName: string;
  requesterEmail: string;
  requesterNote?: string;
  requestedStartUtc: string;
  requestedEndUtc: string;
  durationMinutes: number;
}

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LOCAL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_ADDRESS = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

function validUtcInstant(value: string): boolean {
  if (!UTC_INSTANT.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString() === value;
}

function assertUtcInstant(value: string, label: string): void {
  if (!validUtcInstant(value)) throw new RangeError(`${label} must be a canonical UTC instant`);
}

/** Creates a cryptographically random, URL-safe opaque link identifier (192 bits). */
export function createBookingLinkId(random: Crypto = globalThis.crypto): BookingLinkId {
  if (!random?.getRandomValues) throw new Error("Secure randomness is unavailable");
  const bytes = random.getRandomValues(new Uint8Array(24));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "") as BookingLinkId;
}

export function parseBookingLinkId(value: unknown): BookingLinkId {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{32}$/.test(value)) {
    throw new RangeError("Booking link identifier must be an opaque 192-bit URL-safe token");
  }
  return value as BookingLinkId;
}

export function validateAvailabilityConfiguration(configuration: OwnerAvailabilityConfiguration): void {
  if (!configuration.enabled && !configuration.bookingLinkId) throw new RangeError("Booking link identifier is required");
  if (!configuration.allowedDurationsMinutes.length || configuration.allowedDurationsMinutes.some((duration) => !Number.isSafeInteger(duration) || duration <= 0)) {
    throw new RangeError("Allowed appointment durations must be positive whole minutes");
  }
  if (new Set(configuration.allowedDurationsMinutes).size !== configuration.allowedDurationsMinutes.length) {
    throw new RangeError("Allowed appointment durations must be unique");
  }
  if (![configuration.minimumNoticeMinutes, configuration.bufferBeforeMinutes, configuration.bufferAfterMinutes].every((n) => Number.isSafeInteger(n) && n >= 0) ||
      (configuration.maximumAdvanceMinutes !== undefined && (!Number.isSafeInteger(configuration.maximumAdvanceMinutes) || configuration.maximumAdvanceMinutes <= 0))) {
    throw new RangeError("Notice, advance window, and buffers must be valid whole minutes");
  }
  try { new Intl.DateTimeFormat("en", { timeZone: configuration.timeZone }); }
  catch { throw new RangeError("Availability time zone must be a valid IANA time zone"); }
  for (const window of configuration.windows) {
    if (!Number.isInteger(window.weekday) || window.weekday < 1 || window.weekday > 7 ||
        !LOCAL_TIME.test(window.startLocal) || !LOCAL_TIME.test(window.endLocal) || window.startLocal >= window.endLocal) {
      throw new RangeError("Availability windows require a valid weekday and increasing local times");
    }
  }
  if (configuration.expiresAtUtc !== undefined) assertUtcInstant(configuration.expiresAtUtc, "Booking link expiry");
}

/** Validates minimum requester data and policy bounds without consulting or carrying private schedule records. */
export function validateBookingRequestSubmission(
  submission: BookingRequestSubmission,
  configuration: OwnerAvailabilityConfiguration,
  now: Date = new Date(),
): void {
  validateAvailabilityConfiguration(configuration);
  if (!configuration.enabled) throw new RangeError("Booking link is disabled");
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new RangeError("Current time is invalid");
  if (configuration.expiresAtUtc && Date.parse(configuration.expiresAtUtc) <= nowMs) throw new RangeError("Booking link has expired");
  if (!submission.requesterName.trim() || submission.requesterName.length > 200) throw new RangeError("Requester name is required");
  if (!EMAIL_ADDRESS.test(submission.requesterEmail.trim())) throw new RangeError("Requester email is invalid");
  if (submission.requesterNote !== undefined && typeof submission.requesterNote !== "string") throw new RangeError("Requester note must be text");
  if (!Number.isSafeInteger(submission.durationMinutes) || !configuration.allowedDurationsMinutes.includes(submission.durationMinutes)) {
    throw new RangeError("Requested duration is not allowed");
  }
  assertUtcInstant(submission.requestedStartUtc, "Requested start");
  assertUtcInstant(submission.requestedEndUtc, "Requested end");
  const start = Date.parse(submission.requestedStartUtc);
  const end = Date.parse(submission.requestedEndUtc);
  if (start <= nowMs || end <= start || end - start !== submission.durationMinutes * 60_000) {
    throw new RangeError("Requested appointment times or duration are invalid");
  }
  const notice = configuration.minimumNoticeMinutes * 60_000;
  if (start - nowMs < notice) throw new RangeError("Requested time does not meet minimum notice");
  if (configuration.maximumAdvanceMinutes !== undefined && start - nowMs > configuration.maximumAdvanceMinutes * 60_000) {
    throw new RangeError("Requested time exceeds the booking advance window");
  }
}

/** Only the owner may explicitly transition a Pending request; terminal states cannot be reopened. */
export function decideBookingRequest(request: BookingRequest, decision: "approved" | "rejected"): BookingRequest {
  if (request.status !== "pending") throw new RangeError("Only pending booking requests can be decided");
  return { ...request, status: decision };
}
