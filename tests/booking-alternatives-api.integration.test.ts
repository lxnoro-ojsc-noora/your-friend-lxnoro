import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../server/app";
import { initializeBookingSchema } from "../server/db/schema";
import { proposeBookingAlternative, respondToPublicAlternative } from "../src/platform/bookingClient";

const ownerHeaders = { "x-lxnoro-dev-owner-id":"local-owner" };
const initialNow = new Date("2026-10-08T08:00:00.000Z");
const instances: Array<{ close: () => Promise<void>; db: Database.Database }> = [];

async function setup() {
  let now = new Date(initialNow);
  const db = new Database(":memory:"); initializeBookingSchema(db);
  const app = createServer(db,{ developmentAuth:true,bookingNow:()=>now });
  await app.listen({host:"127.0.0.1",port:0});
  const address=app.server.address(); if (!address || typeof address === "string") throw new Error("Test API did not bind");
  const base=`http://127.0.0.1:${address.port}`;
  const routeFetch: typeof fetch=(input,init)=>fetch(new URL(String(input),base),init);
  instances.push({close:()=>app.close(),db});
  const configured=await fetch(base+"/api/owner/booking/configuration",{
    method:"PUT",headers:{...ownerHeaders,"content-type":"application/json"},
    body:JSON.stringify({enabled:true,allowedDurationsMinutes:[30,60],windows:[{weekday:4,startLocal:"09:00",endLocal:"17:00"}],minimumNoticeMinutes:30,maximumAdvanceMinutes:60*24*90,bufferBeforeMinutes:0,bufferAfterMinutes:0,timeZone:"Asia/Yerevan",expiresAtUtc:"2026-12-31T00:00:00.000Z"}),
  });
  const {bookingLinkId}=await configured.json() as {bookingLinkId:string};
  const submitted=await fetch(base+`/api/public/booking/${bookingLinkId}/requests`,{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({requesterName:"Jordan Example",requesterEmail:"jordan@example.com",requesterNote:"Requester note only",requestedStartUtc:"2026-10-08T10:00:00.000Z",requestedEndUtc:"2026-10-08T10:30:00.000Z",durationMinutes:30}),
  });
  const request=await submitted.json() as {requestId:string;status:string};
  return { app,db,base,routeFetch,bookingLinkId,requestId:request.requestId,advanceNow:(next:Date)=>{now=next;} };
}

afterEach(async()=>{await Promise.all(instances.splice(0).map(async({close,db})=>{await close();if(db.open)db.close();}));});

const proposalInput={proposedDate:"2026-10-10",proposedStartTime:"11:00",durationMinutes:60,timeZone:"Asia/Yerevan"};

describe("Slice 7 alternative HTTP/API integration",()=>{
  it("creates an owner-authenticated arbitrary-date proposal while the original request stays Pending",async()=>{
    const state=await setup();
    const response=await proposeBookingAlternative(state.requestId,proposalInput,state.routeFetch);
    expect(response).toMatchObject({proposedDate:"2026-10-10",proposedStartTime:"11:00",startUtc:"2026-10-10T07:00:00.000Z",durationMinutes:60,timeZone:"Asia/Yerevan",status:"proposed"});
    expect(response.responseKey).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(state.db.prepare("SELECT status FROM booking_requests WHERE request_id=?").get(state.requestId)).toEqual({status:"pending"});
    expect(state.db.prepare("SELECT COUNT(*) AS count FROM confirmed_appointments").get()).toEqual({count:0});
  });

  it("rejects invalid alternative duration/timezone and unauthenticated owner proposals",async()=>{
    const state=await setup();
    await expect(proposeBookingAlternative(state.requestId,{...proposalInput,durationMinutes:45},state.routeFetch)).rejects.toThrow("invalid_booking_alternative");
    await expect(proposeBookingAlternative(state.requestId,{...proposalInput,timeZone:"UTC"},state.routeFetch)).rejects.toThrow("invalid_booking_alternative");
    const response=await fetch(state.base+`/api/owner/booking/requests/${state.requestId}/alternatives`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(proposalInput)});
    expect(response.status).toBe(401);
  });

  it("records requester acceptance without approving the parent or creating an appointment",async()=>{
    const state=await setup();
    const proposal=await proposeBookingAlternative(state.requestId,proposalInput,state.routeFetch);
    const result=await respondToPublicAlternative(proposal.responseKey,"accept",state.routeFetch);
    expect(result.status).toBe("accepted");
    expect(state.db.prepare("SELECT status FROM booking_requests WHERE request_id=?").get(state.requestId)).toEqual({status:"pending"});
    expect(state.db.prepare("SELECT COUNT(*) AS count FROM confirmed_appointments").get()).toEqual({count:0});
  });

  it("records requester rejection and leaves the original request Pending",async()=>{
    const state=await setup();
    const proposal=await proposeBookingAlternative(state.requestId,proposalInput,state.routeFetch);
    expect((await respondToPublicAlternative(proposal.responseKey,"reject",state.routeFetch)).status).toBe("rejected");
    expect(state.db.prepare("SELECT status FROM booking_requests WHERE request_id=?").get(state.requestId)).toEqual({status:"pending"});
    expect(state.db.prepare("SELECT COUNT(*) AS count FROM confirmed_appointments").get()).toEqual({count:0});
  });

  it("rejects duplicate responses and invalid/unknown response keys safely",async()=>{
    const state=await setup();
    const proposal=await proposeBookingAlternative(state.requestId,proposalInput,state.routeFetch);
    await respondToPublicAlternative(proposal.responseKey,"accept",state.routeFetch);
    await expect(respondToPublicAlternative(proposal.responseKey,"accept",state.routeFetch)).rejects.toThrow("alternative_already_responded");
    await expect(respondToPublicAlternative("X".repeat(32),"accept",state.routeFetch)).rejects.toThrow("alternative_unavailable");
    const malformed=await fetch(state.base+"/api/public/booking/alternatives/not-a-key/response",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({decision:"accept"})});
    expect(malformed.status).toBe(404);
  });

  it("rejects alternatives after the proposal time has expired",async()=>{
    const state=await setup();
    const proposal=await proposeBookingAlternative(state.requestId,proposalInput,state.routeFetch);
    state.advanceNow(new Date("2026-10-11T00:00:00.000Z"));
    await expect(respondToPublicAlternative(proposal.responseKey,"accept",state.routeFetch)).rejects.toThrow("alternative_expired");
    expect(state.db.prepare("SELECT status FROM booking_alternative_proposals").get()).toEqual({status:"proposed"});
  });

  it("rejects response after the owner finalizes the parent request",async()=>{
    const state=await setup();
    const proposal=await proposeBookingAlternative(state.requestId,proposalInput,state.routeFetch);
    const finalized=await fetch(state.base+`/api/owner/booking/requests/${state.requestId}/decision`,{method:"POST",headers:{...ownerHeaders,"content-type":"application/json"},body:JSON.stringify({decision:"rejected"})});
    expect(finalized.status).toBe(200);
    await expect(respondToPublicAlternative(proposal.responseKey,"accept",state.routeFetch)).rejects.toThrow("booking_request_finalized");
    expect(state.db.prepare("SELECT status FROM booking_alternative_proposals").get()).toEqual({status:"proposed"});
  });

  it("keeps public proposal response fields privacy-safe",async()=>{
    const state=await setup();
    const proposal=await proposeBookingAlternative(state.requestId,proposalInput,state.routeFetch);
    const raw=await fetch(state.base+`/api/public/booking/alternatives/${proposal.responseKey}/response`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({decision:"reject"})});
    const body=await raw.json() as Record<string,unknown>;
    expect(Object.keys(body).sort()).toEqual(["durationMinutes","proposedDate","proposedStartTime","status","timeZone"]);
    expect(JSON.stringify(body)).not.toMatch(/owner|requestId|proposalId|activity|task|title|notes|category|schedule|reason|Jordan|jordan@example.com/);
    expect(JSON.stringify(proposal)).not.toMatch(/owner-1|local-owner|requesterNote|category|fullSchedule/);
  });

  it("preserves ordinary Slice 6 owner approval and confirmation",async()=>{
    const state=await setup();
    const response=await fetch(state.base+`/api/owner/booking/requests/${state.requestId}/decision`,{method:"POST",headers:{...ownerHeaders,"content-type":"application/json"},body:JSON.stringify({decision:"approved"})});
    expect(response.status).toBe(200);
    expect(state.db.prepare("SELECT status FROM booking_requests WHERE request_id=?").get(state.requestId)).toEqual({status:"approved"});
    expect(state.db.prepare("SELECT COUNT(*) AS count FROM confirmed_appointments WHERE request_id=?").get(state.requestId)).toEqual({count:1});
  });
});
