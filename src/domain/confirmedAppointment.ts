import { Temporal } from "@js-temporal/polyfill";
import type { ScheduledActivity } from "./model";

/** Minimum server-owned fields required to draw one confirmed appointment in the local matrix. */
export interface ConfirmedAppointmentProjection {
  id: string;
  startUtc: string;
  endUtc: string;
  durationMinutes: number;
  timeZone: string;
}

export interface LocalConfirmedAppointment extends ConfirmedAppointmentProjection {
  id: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function confirmedAppointmentToActivity(
  appointment: ConfirmedAppointmentProjection,
  localizedTitle = "Shared appointment",
): ScheduledActivity {
  const start = Temporal.Instant.from(appointment.startUtc);
  const end = Temporal.Instant.from(appointment.endUtc);
  if (!appointment.id || !Number.isSafeInteger(appointment.durationMinutes) || appointment.durationMinutes <= 0 ||
      Number(end.epochMilliseconds) - Number(start.epochMilliseconds) !== appointment.durationMinutes * 60_000) {
    throw new RangeError("Confirmed appointment projection is invalid");
  }
  const zoned = start.toZonedDateTimeISO(appointment.timeZone);
  return {
    id: "booking:" + appointment.id,
    typeId: "booking-appointment",
    title: localizedTitle,
    symbol: "📅",
    startLocal: zoned.toPlainDate().toString() + "T" + pad(zoned.hour) + ":" + pad(zoned.minute),
    startUtc: appointment.startUtc,
    timeZone: appointment.timeZone,
    durationMinutes: appointment.durationMinutes,
    status: "scheduled",
    notes: "",
    alertEnabled: true,
    createdAt: appointment.startUtc,
  };
}

export function confirmedAppointmentToActivityList(
  appointments: readonly ConfirmedAppointmentProjection[],
  localizedTitle = "Shared appointment",
): ScheduledActivity[] {
  return appointments.map((appointment) => confirmedAppointmentToActivity(appointment, localizedTitle));
}
