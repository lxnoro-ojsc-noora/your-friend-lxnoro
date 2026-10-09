import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createBookingLinkId, type OwnerAvailabilityConfiguration } from "../src/domain/booking";
import {
  BookingAlternativeConflictError, BookingAlternativeNotFoundError,
  createBookingAlternativeProposal, createPendingBookingRequest, decideOwnerBookingRequest, listBookingAlternativeProposals,
  listOwnerBookingRequests, recordBookingAlternativeResponse, saveBookingLinkConfiguration,
} from "../server/db/repositories/bookings";
import { initializeBookingSchema } from "../server/db/schema";

const databases: Database.Database[] = [];
const now = new Date("2026-10-08T08:00:00.000Z");
afterEach(() => { for (const db of databases.splice(0)) if (db.open) db.close(); });

function setup() {
  const db = new Database(":memory:"); databases.push(db); initializeBookingSchema(db);
  const bookingLinkId = createBookingLinkId();
  const configuration: OwnerAvailabilityConfiguration = {
    bookingLinkId,enabled:true,allowedDurationsMinutes:[30,60],
    windows:[{ weekday:4,startLocal:"09:00",endLocal:"17:00" }],minimumNoticeMinutes:30,
    maximumAdvanceMinutes:60*24*90,bufferBeforeMinutes:10,bufferAfterMinutes:10,
    timeZone:"Asia/Yerevan",expiresAtUtc:"2027-01-01T00:00:00.000Z",
  };
  saveBookingLinkConfiguration(db,"owner-1",configuration,now);
  const request = createPendingBookingRequest(db,bookingLinkId,{
    requesterName:"Jordan",requesterEmail:"jordan@example.com",requesterNote:"Arrival detail",
    requestedStartUtc:"2026-10-08T10:00:00.000Z",requestedEndUtc:"2026-10-08T10:30:00.000Z",durationMinutes:30,
  },now);
  return { db,request };
}
const alternative = { proposedDate:"2026-10-10",proposedStartTime:"11:00",durationMinutes:60,timeZone:"Asia/Yerevan" };

describe("booking alternative SQLite persistence", () => {
  it("stores an opaque proposal and response-key hash while preserving the pending request", () => {
    const { db,request } = setup();
    const created = createBookingAlternativeProposal(db,"owner-1",request.id,alternative,now);
    expect(created.proposal).toMatchObject({
      requestId:request.id,proposedDate:"2026-10-10",proposedStartTime:"11:00",
      startUtc:"2026-10-10T07:00:00.000Z",endUtc:"2026-10-10T08:00:00.000Z",
      durationMinutes:60,timeZone:"Asia/Yerevan",status:"proposed",
    });
    expect(created.proposal.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created.responseKey).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(listOwnerBookingRequests(db,"owner-1","pending")).toEqual([request]);
    const stored = db.prepare("SELECT * FROM booking_alternative_proposals").get() as Record<string,unknown>;
    expect(stored.response_key_hash).not.toBe(created.responseKey);
    expect(stored.response_key_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toMatch(/Jordan|jordan|Arrival detail|task|activity|category|title|notes/);
    expect(JSON.stringify(created.proposal)).not.toMatch(/owner-1|Jordan|jordan|Arrival detail|task|activity|category|title|notes/);
  });

  it("records acceptance idempotently by opaque response key and preserves proposal history", () => {
    const { db,request } = setup();
    const created = createBookingAlternativeProposal(db,"owner-1",request.id,alternative,now);
    const first = recordBookingAlternativeResponse(db,created.responseKey,"accepted",new Date("2026-10-08T09:00:00.000Z"));
    const replay = recordBookingAlternativeResponse(db,created.responseKey,"accepted",new Date("2026-10-08T10:00:00.000Z"));
    expect(replay).toEqual(first);
    expect(first.status).toBe("accepted");
    expect(first.respondedAtUtc).toBe("2026-10-08T09:00:00.000Z");
    expect(() => recordBookingAlternativeResponse(db,created.responseKey,"rejected",now)).toThrow(BookingAlternativeConflictError);
    expect(listOwnerBookingRequests(db,"owner-1","pending")).toEqual([request]);
    expect(listBookingAlternativeProposals(db,"owner-1",request.id)).toEqual([first]);
  });

  it("records explicit rejection and permits a later proposal without erasing history", () => {
    const { db,request } = setup();
    const first = createBookingAlternativeProposal(db,"owner-1",request.id,alternative,now);
    const rejected = recordBookingAlternativeResponse(db,first.responseKey,"rejected",new Date("2026-10-08T09:00:00.000Z"));
    const second = createBookingAlternativeProposal(db,"owner-1",request.id,{ ...alternative,proposedDate:"2026-10-12",proposedStartTime:"12:00" },now);
    expect(rejected.status).toBe("rejected");
    expect(second.proposal.status).toBe("proposed");
    expect(listBookingAlternativeProposals(db,"owner-1",request.id)).toHaveLength(2);
    expect(listOwnerBookingRequests(db,"owner-1","pending")).toEqual([request]);
  });

  it("blocks concurrent open proposals, invalid input, and unknown response keys without partial writes", () => {
    const { db,request } = setup();
    createBookingAlternativeProposal(db,"owner-1",request.id,alternative,now);
    expect(() => createBookingAlternativeProposal(db,"owner-1",request.id,alternative,now)).toThrow(BookingAlternativeConflictError);
    expect(() => createBookingAlternativeProposal(db,"different-owner",request.id,alternative,now)).toThrow();
    expect(() => recordBookingAlternativeResponse(db,"X".repeat(32),"accepted",now)).toThrow(BookingAlternativeNotFoundError);
    expect(() => createBookingAlternativeProposal(db,"owner-1",request.id,{ ...alternative,durationMinutes:45 },now)).toThrow(RangeError);
    expect(listBookingAlternativeProposals(db,"owner-1",request.id)).toHaveLength(1);
  });

  it("does not accept a still-proposed alternative after the original request is decided", () => {
    const { db,request } = setup();
    const created = createBookingAlternativeProposal(db,"owner-1",request.id,alternative,now);
    decideOwnerBookingRequest(db,"owner-1",request.id,"rejected",now);
    expect(() => recordBookingAlternativeResponse(db,created.responseKey,"accepted",now)).toThrow(BookingAlternativeConflictError);
    expect(listBookingAlternativeProposals(db,"owner-1",request.id)[0]?.status).toBe("proposed");
  });

  it("keeps proposal fields limited to timing, timezone, state, and opaque keys", () => {
    const { db,request } = setup();
    createBookingAlternativeProposal(db,"owner-1",request.id,alternative,now);
    const columns = db.prepare("SELECT name FROM pragma_table_info('booking_alternative_proposals')").all() as Array<{name:string}>;
    expect(columns.map(({name})=>name)).toEqual([
      "proposal_id","request_id","response_key_hash","proposed_date","proposed_start_local","start_utc","end_utc",
      "duration_minutes","time_zone","status","confirmed_projection_revision","created_at_utc","responded_at_utc",
    ]);
  });
});
