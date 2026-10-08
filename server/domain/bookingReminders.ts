import { Temporal } from "@js-temporal/polyfill";

export type BookingReminderCadence = "same_day" | "24_hour" | "three_hour_follow_up";
export interface ScheduledBookingReminder {
  cadence: BookingReminderCadence;
  cadenceKey: string;
  dueAtUtc: string;
}

function instantIso(epochMs: number): string {
  return Temporal.Instant.fromEpochMilliseconds(epochMs).toString({ fractionalSecondDigits: 3 });
}

export function ownerLocalDate(epochMs: number, timeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(epochMs).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

/** Moves a reminder to the first valid owner-local instant outside the configured quiet interval. */
export function deferBookingReminderUntilAllowed(
  dueAtUtc: string,
  timeZone: string,
  quietStartLocal?: string,
  quietEndLocal?: string,
): string {
  if (!quietStartLocal || !quietEndLocal || quietStartLocal === quietEndLocal) return dueAtUtc;
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(quietStartLocal) || !timePattern.test(quietEndLocal)) throw new RangeError("Quiet hours must be local HH:mm values");
  const zoned = Temporal.Instant.from(dueAtUtc).toZonedDateTimeISO(timeZone);
  const minute = zoned.hour * 60 + zoned.minute;
  const start = Number(quietStartLocal.slice(0, 2)) * 60 + Number(quietStartLocal.slice(3));
  const end = Number(quietEndLocal.slice(0, 2)) * 60 + Number(quietEndLocal.slice(3));
  const quiet = start < end ? minute >= start && minute < end : minute >= start || minute < end;
  if (!quiet) return dueAtUtc;
  const targetDate = start > end && minute >= start ? zoned.toPlainDate().add({ days: 1 }) : zoned.toPlainDate();
  const localEnd = Temporal.PlainDateTime.from(`${targetDate.toString()}T${quietEndLocal}`);
  return localEnd.toZonedDateTime(timeZone, { disambiguation: "later" }).toInstant().toString({ fractionalSecondDigits: 3 });
}

/** Same-day once on creation, then at T-24h and every three elapsed hours until the requested time. */
export function buildBookingReminderCadence(input: {
  requestId: string;
  createdAtUtc: string;
  requestedStartUtc: string;
  timeZone: string;
  quietStartLocal?: string;
  quietEndLocal?: string;
}): ScheduledBookingReminder[] {
  const createdMs = Date.parse(input.createdAtUtc);
  const startMs = Date.parse(input.requestedStartUtc);
  if (!Number.isFinite(createdMs) || !Number.isFinite(startMs) || startMs <= createdMs) return [];
  // Validate IANA zone early even when this request is outside the reminder window.
  new Intl.DateTimeFormat("en", { timeZone: input.timeZone });
  const schedule = (cadence: BookingReminderCadence, key: string, dueMs: number): ScheduledBookingReminder | undefined => {
    const due = deferBookingReminderUntilAllowed(instantIso(dueMs), input.timeZone, input.quietStartLocal, input.quietEndLocal);
    if (Date.parse(due) >= startMs) return undefined;
    return { cadence, cadenceKey: key, dueAtUtc: due };
  };
  const localDay = ownerLocalDate(createdMs, input.timeZone);
  const reminders: ScheduledBookingReminder[] = [];
  const sameDay = schedule("same_day", `same-day:${localDay}`, createdMs);
  if (sameDay) reminders.push(sameDay);

  const anchorMs = Math.max(createdMs, startMs - 24 * 60 * 60_000);
  const threshold = schedule("24_hour", "before-start:24h", anchorMs);
  if (threshold) reminders.push(threshold);
  for (let index = 1, dueMs = anchorMs + 3 * 60 * 60_000; dueMs < startMs; index += 1, dueMs += 3 * 60 * 60_000) {
    const followUp = schedule("three_hour_follow_up", `before-start:3h:${index}`, dueMs);
    if (followUp) reminders.push(followUp);
  }
  return reminders;
}
