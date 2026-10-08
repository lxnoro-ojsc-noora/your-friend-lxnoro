import type { ConfirmedAppointmentProjection } from "../domain/confirmedAppointment";
import { database, type LxnoroDatabase } from "./database";

/** Replaces the confirmed-only remote snapshot; primary-key replacement makes repeated refreshes idempotent. */
export async function replaceConfirmedAppointmentSnapshot(
  appointments: readonly ConfirmedAppointmentProjection[],
  db: LxnoroDatabase = database,
): Promise<void> {
  const ids = new Set<string>();
  for (const appointment of appointments) {
    if (!appointment.id || ids.has(appointment.id)) throw new RangeError("Confirmed appointment identifiers must be unique");
    ids.add(appointment.id);
  }
  await db.transaction("rw", db.confirmedBookingAppointments, async () => {
    await db.confirmedBookingAppointments.clear();
    if (appointments.length) await db.confirmedBookingAppointments.bulkPut(appointments.map((item) => ({ ...item })));
  });
}

export function getConfirmedAppointmentSnapshot(
  db: LxnoroDatabase = database,
): Promise<ConfirmedAppointmentProjection[]> {
  return db.confirmedBookingAppointments.orderBy("startUtc").toArray();
}
