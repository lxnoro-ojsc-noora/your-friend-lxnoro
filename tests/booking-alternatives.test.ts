import { describe, expect, it } from "vitest";
import {
  createBookingLinkId, respondToBookingAlternative, validateBookingAlternative,
  type BookingAlternativeProposal, type OwnerAvailabilityConfiguration,
} from "../src/domain/booking";

const now = new Date("2026-10-08T08:00:00.000Z");
const configuration = (overrides: Partial<OwnerAvailabilityConfiguration> = {}): OwnerAvailabilityConfiguration => ({
  bookingLinkId:createBookingLinkId(), enabled:true, allowedDurationsMinutes:[30,60],
  windows:[{ weekday:4,startLocal:"09:00",endLocal:"17:00" }], minimumNoticeMinutes:30,
  maximumAdvanceMinutes:60*24*90, bufferBeforeMinutes:10, bufferAfterMinutes:10,
  timeZone:"Asia/Yerevan", expiresAtUtc:"2027-01-01T00:00:00.000Z", ...overrides,
});
const requester = { requesterName:"Alex", requesterEmail:"alex@example.com", requesterNote:"Please call on arrival." };
const proposal: BookingAlternativeProposal = {
  id:"ba4ac2f2-cb98-43b8-9978-5e56f1d2f8c1", requestId:"e9e675ea-e7c4-47a8-9b14-3352b35f3061",
  proposedDate:"2026-10-10", proposedStartTime:"11:00", startUtc:"2026-10-10T07:00:00.000Z",
  endUtc:"2026-10-10T07:30:00.000Z", durationMinutes:30, timeZone:"Asia/Yerevan",
  status:"proposed", createdAtUtc:"2026-10-08T08:00:00.000Z",
};

describe("booking alternative domain", () => {
  it("converts arbitrary owner-local date/time into an exact timezone-aware interval", () => {
    expect(validateBookingAlternative({ proposedDate:"2026-10-10",proposedStartTime:"11:00",durationMinutes:60,timeZone:"Asia/Yerevan" },requester,configuration(),now))
      .toMatchObject({ startUtc:"2026-10-10T07:00:00.000Z",endUtc:"2026-10-10T08:00:00.000Z",proposedDate:"2026-10-10",proposedStartTime:"11:00",timeZone:"Asia/Yerevan" });
  });

  it.each([
    ["unallowed duration",{ proposedDate:"2026-10-10",proposedStartTime:"11:00",durationMinutes:45,timeZone:"Asia/Yerevan" }],
    ["wrong timezone",{ proposedDate:"2026-10-10",proposedStartTime:"11:00",durationMinutes:30,timeZone:"UTC" }],
    ["malformed date",{ proposedDate:"2026-02-30",proposedStartTime:"11:00",durationMinutes:30,timeZone:"Asia/Yerevan" }],
    ["malformed time",{ proposedDate:"2026-10-10",proposedStartTime:"25:00",durationMinutes:30,timeZone:"Asia/Yerevan" }],
  ])("rejects %s", (_label,input) => expect(() => validateBookingAlternative(input,requester,configuration(),now)).toThrow(RangeError));

  it("rejects ambiguous or nonexistent DST wall times rather than guessing", () => {
    const eastern = configuration({ timeZone:"America/New_York" });
    expect(() => validateBookingAlternative({ proposedDate:"2026-03-08",proposedStartTime:"02:30",durationMinutes:30,timeZone:"America/New_York" },requester,eastern,now)).toThrow(RangeError);
  });

  it("models explicit terminal requester responses and permits only same-decision replay", () => {
    const accepted = respondToBookingAlternative(proposal,"accepted","2026-10-08T09:00:00.000Z");
    expect(accepted).toMatchObject({ status:"accepted",respondedAtUtc:"2026-10-08T09:00:00.000Z" });
    expect(respondToBookingAlternative(accepted,"accepted","2026-10-08T10:00:00.000Z")).toBe(accepted);
    expect(() => respondToBookingAlternative(accepted,"rejected","2026-10-08T10:00:00.000Z")).toThrow(/different final state/);
    expect(respondToBookingAlternative(proposal,"rejected","2026-10-08T09:00:00.000Z").status).toBe("rejected");
  });
});
