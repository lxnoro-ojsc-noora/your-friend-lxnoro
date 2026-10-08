import "fake-indexeddb/auto";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { replaceConfirmedAppointmentSnapshot, getConfirmedAppointmentSnapshot } from "../src/data/confirmedAppointments";
import { LxnoroDatabase } from "../src/data/database";
import { confirmedAppointmentToActivityList } from "../src/domain/confirmedAppointment";
import { expandActivities } from "../src/domain/recurrence";
import { getPublicAvailability, listPendingBookingRequests, submitPublicBookingRequest, decideBookingRequest } from "../src/platform/bookingClient";
import { fetchConfirmedAppointmentProjections } from "../src/platform/bookingApi";
import { createServer } from "../server/app";
import { initializeBookingSchema } from "../server/db/schema";

const fixedNow = new Date("2026-10-08T08:00:00.000Z");
const servers: Array<() => Promise<void>> = [];
const localDatabases: LxnoroDatabase[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((close) => close()));
  await Promise.all(localDatabases.splice(0).map(async (database) => { await database.delete(); database.close(); }));
});

describe("Slice 6 booking UI/API flow", () => {
  it("keeps requester data Pending until owner approval, then adds only confirmed projection to local matrix", async () => {
    const serverDb = new Database(":memory:");
    initializeBookingSchema(serverDb);
    const app = createServer(serverDb, { developmentAuth:true, bookingNow:() => fixedNow });
    await app.listen({ host:"127.0.0.1", port:0 });
    servers.push(() => app.close());
    const address = app.server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    const base = `http://127.0.0.1:${address.port}`;
    const routeFetch: typeof fetch = (input, init) => fetch(new URL(String(input),base),init);
    const configResponse = await fetch(base+"/api/owner/booking/configuration", {
      method:"PUT", headers:{ "content-type":"application/json", "x-lxnoro-dev-owner-id":"local-owner" },
      body:JSON.stringify({ enabled:true,allowedDurationsMinutes:[30],windows:[{ weekday:4,startLocal:"13:00",endLocal:"17:00" }],minimumNoticeMinutes:30,bufferBeforeMinutes:0,bufferAfterMinutes:0,timeZone:"Asia/Yerevan" }),
    });
    const { bookingLinkId } = await configResponse.json() as { bookingLinkId:string };
    const available = await getPublicAvailability(bookingLinkId,"2026-10-08T08:00:00.000Z","2026-10-08T12:00:00.000Z",routeFetch);
    expect(available.availableSlots.length).toBeGreaterThan(0);
    expect(Object.keys(available).sort()).toEqual(["availableSlots","timeZone"]);
    const selected = available.availableSlots[0]!;
    const created = await submitPublicBookingRequest(bookingLinkId,{
      requesterName:"Jordan Example",requesterEmail:"jordan@example.test",requesterNote:"Doorbell is on the left.",
      requestedStartUtc:selected.startUtc,requestedEndUtc:selected.endUtc,durationMinutes:selected.durationMinutes,
    },routeFetch);
    expect(created.status).toBe("pending");
    let pending = await listPendingBookingRequests(routeFetch);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.requesterName).toBe("Jordan Example");
    expect(pending[0]?.status).toBe("pending");
    expect(serverDb.prepare("SELECT COUNT(*) AS count FROM confirmed_appointments").get()).toEqual({ count:0 });

    await decideBookingRequest(pending[0]!.id,"approved",routeFetch);
    pending = await listPendingBookingRequests(routeFetch);
    expect(pending).toHaveLength(0);
    const local = new LxnoroDatabase("booking-ui-flow-"+crypto.randomUUID());
    localDatabases.push(local);
    const appointments = await fetchConfirmedAppointmentProjections({
      developmentOwnerId:"local-owner",appointmentsEndpoint:base+"/api/owner/booking/appointments",
    });
    expect(appointments).toHaveLength(1);
    expect(appointments[0]).not.toHaveProperty("requesterName");
    await replaceConfirmedAppointmentSnapshot(appointments,local);
    await replaceConfirmedAppointmentSnapshot(appointments,local);
    const activities = confirmedAppointmentToActivityList(await getConfirmedAppointmentSnapshot(local));
    const matrix = expandActivities(activities,"2026-10-08","2026-10-09");
    expect(matrix).toHaveLength(1);
    expect(matrix[0]?.title).toBe("Shared appointment");
    expect(matrix[0]?.startUtc).toBe(selected.startUtc);
    expect(JSON.stringify(matrix)).not.toContain("Jordan Example");
  });
});
