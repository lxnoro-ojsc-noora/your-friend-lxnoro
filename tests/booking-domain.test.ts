import { describe, expect, it } from "vitest";
import {
  createBookingLinkId,
  decideBookingRequest,
  parseBookingLinkId,
  validateAvailabilityConfiguration,
  validateBookingRequestSubmission,
  type BookingRequest,
  type OwnerAvailabilityConfiguration,
} from "../src/domain/booking";

const now = new Date("2026-10-08T08:00:00.000Z");
const linkId = parseBookingLinkId("0123456789abcdefghijklmnopqrstuv");
const configuration = (overrides: Partial<OwnerAvailabilityConfiguration> = {}): OwnerAvailabilityConfiguration => ({
  bookingLinkId: linkId,
  enabled: true,
  allowedDurationsMinutes: [30, 60],
  windows: [{ weekday: 4, startLocal: "09:00", endLocal: "17:00" }],
  minimumNoticeMinutes: 60,
  maximumAdvanceMinutes: 60 * 24 * 90,
  bufferBeforeMinutes: 5,
  bufferAfterMinutes: 10,
  timeZone: "Asia/Yerevan",
  ...overrides,
});
const submission = {
  requesterName: "Alex Example",
  requesterEmail: "alex@example.com",
  requesterNote: "Discuss the appointment",
  requestedStartUtc: "2026-10-08T10:00:00.000Z",
  requestedEndUtc: "2026-10-08T10:30:00.000Z",
  durationMinutes: 30,
};

describe("booking request domain foundation", () => {
  it("creates and parses opaque URL-safe booking link identifiers", () => {
    const generated = createBookingLinkId();
    expect(generated).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(parseBookingLinkId(generated)).toBe(generated);
    expect(() => parseBookingLinkId("owner-123-booking-link")).toThrow(RangeError);
  });

  it("accepts valid availability policy and a request using an allowed duration", () => {
    const policy = configuration();
    expect(() => validateAvailabilityConfiguration(policy)).not.toThrow();
    expect(() => validateBookingRequestSubmission(submission, policy, now)).not.toThrow();
  });

  it.each([
    ["unlisted duration", { ...submission, durationMinutes: 45, requestedEndUtc: "2026-10-08T10:45:00.000Z" }],
    ["duration/time mismatch", { ...submission, requestedEndUtc: "2026-10-08T10:31:00.000Z" }],
    ["invalid UTC time", { ...submission, requestedStartUtc: "2026-10-08T10:00:00+02:00" }],
    ["past time", { ...submission, requestedStartUtc: "2026-10-08T07:00:00.000Z", requestedEndUtc: "2026-10-08T07:30:00.000Z" }],
    ["invalid email", { ...submission, requesterEmail: "not-an-email" }],
    ["ambiguous recipient list email", { ...submission, requesterEmail: "first,second@example.com" }],
    ["email header injection", { ...submission, requesterEmail: "first@example.com\r\nBcc:second@example.com" }],
  ])("rejects %s submissions", (_label, invalid) => {
    expect(() => validateBookingRequestSubmission(invalid, configuration(), now)).toThrow(RangeError);
  });

  it("rejects expired or disabled links and requests outside notice bounds", () => {
    expect(() => validateBookingRequestSubmission(submission, configuration({ expiresAtUtc: "2026-10-08T07:59:00.000Z" }), now)).toThrow(/expired/);
    expect(() => validateBookingRequestSubmission(submission, configuration({ enabled: false }), now)).toThrow(/disabled/);
    expect(() => validateBookingRequestSubmission(submission, configuration({ minimumNoticeMinutes: 180 }), now)).toThrow(/notice/);
  });

  it("validates weekly windows, IANA timezone, and duration settings", () => {
    expect(() => validateAvailabilityConfiguration(configuration({ timeZone: "Mars/Olympus" }))).toThrow(/time zone/);
    expect(() => validateAvailabilityConfiguration(configuration({ windows: [{ weekday: 8, startLocal: "17:00", endLocal: "09:00" }] }))).toThrow(/windows/);
    expect(() => validateAvailabilityConfiguration(configuration({ allowedDurationsMinutes: [0] }))).toThrow(/durations/);
  });

  it("supports explicit pending decisions and keeps final decisions terminal", () => {
    const request: BookingRequest = {
      id: "request-1", bookingLinkId: linkId, requesterName: submission.requesterName,
      requesterEmail: submission.requesterEmail, requesterNote: submission.requesterNote,
      requestedStartUtc: submission.requestedStartUtc, requestedEndUtc: submission.requestedEndUtc,
      durationMinutes: submission.durationMinutes, status: "pending", createdAtUtc: now.toISOString(),
    };
    expect(decideBookingRequest(request, "approved").status).toBe("approved");
    expect(decideBookingRequest(request, "rejected").status).toBe("rejected");
    expect(() => decideBookingRequest({ ...request, status: "approved" }, "rejected")).toThrow(/pending/);
  });

  it("keeps serialized booking records free of private schedule fields", () => {
    const policy = configuration();
    const request: BookingRequest = {
      id: "request-1", bookingLinkId: policy.bookingLinkId, requesterName: submission.requesterName,
      requesterEmail: submission.requesterEmail, requestedStartUtc: submission.requestedStartUtc,
      requestedEndUtc: submission.requestedEndUtc, durationMinutes: submission.durationMinutes,
      status: "pending", createdAtUtc: now.toISOString(),
    };
    const serialized = JSON.stringify({ request, policy });
    for (const forbidden of ["taskId", "activityId", "title", "notes", "category", "fullSchedule"]) expect(serialized).not.toContain(forbidden);
  });
});
