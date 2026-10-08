import type { Horizon } from "./model";
import { Temporal } from "@js-temporal/polyfill";

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type LocalTimeDisambiguation = "compatible" | "earlier" | "later" | "reject";

export function localDateTime(
  dateKey: string,
  time: string,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  disambiguation: LocalTimeDisambiguation = "compatible",
): Date {
  const plainDateTime = Temporal.PlainDateTime.from(`${dateKey}T${time}:00`);
  const zonedDateTime = plainDateTime.toZonedDateTime(timeZone, { disambiguation });
  return new Date(Number(zonedDateTime.epochMilliseconds));
}

export function nearestQuarterHour(date: Date): string {
  const rounded = nearestQuarterDate(date);
  return `${String(rounded.getHours()).padStart(2, "0")}:${String(rounded.getMinutes()).padStart(2, "0")}`;
}

export function nearestQuarterDate(date: Date): Date {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  rounded.setMinutes(Math.ceil(rounded.getMinutes() / 15) * 15);
  return rounded;
}

export function horizonBounds(horizon: Horizon, anchor: Date): { start: Date; end: Date } {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const end = new Date(start);

  if (horizon === "day") {
    end.setDate(end.getDate() + 1);
  } else if (horizon === "week") {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  } else if (horizon === "month") {
    start.setDate(1);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 1);
  } else if (horizon === "year") {
    start.setMonth(0, 1);
    end.setFullYear(start.getFullYear() + 1, 0, 1);
  } else {
    start.setMonth(0, 1);
    end.setFullYear(start.getFullYear() + 5, 0, 1);
  }

  return { start, end };
}

export function activityDateKey(startLocal: string): string {
  return startLocal.slice(0, 10);
}

export function activityInstant(startLocal: string, timeZone: string, exactStartUtc?: string): Date {
  if (exactStartUtc !== undefined) {
    const instant = new Date(exactStartUtc);
    if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== exactStartUtc) {
      throw new RangeError("Exact activity instant must be a canonical UTC instant");
    }
    return instant;
  }
  return localDateTime(activityDateKey(startLocal), startLocal.slice(11, 16), timeZone);
}

export function addActivityMinutes(startLocal: string, timeZone: string, minutes: number): string {
  const instant = activityInstant(startLocal, timeZone);
  const zoned = Temporal.Instant.fromEpochMilliseconds(instant.getTime()).add({ minutes }).toZonedDateTimeISO(timeZone);
  return `${zoned.toPlainDate().toString()}T${String(zoned.hour).padStart(2, "0")}:${String(zoned.minute).padStart(2, "0")}`;
}

export function minutesIntoDay(startLocal: string): number {
  const time = startLocal.slice(11, 16);
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function isInRange(startLocal: string, start: Date, end: Date): boolean {
  const [year = 1970, month = 1, day = 1] = activityDateKey(startLocal).split("-").map(Number);
  const activityDate = new Date(year, month - 1, day);
  return activityDate >= start && activityDate < end;
}
