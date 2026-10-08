import { Temporal } from "@js-temporal/polyfill";
import type { ActivityOccurrenceOverride, RecurrenceRule, ScheduledActivity, ScheduledOccurrence } from "./model";
import { activityDateKey } from "./time";

const dateOf = (value: string) => Temporal.PlainDate.from(value.slice(0, 10));
const padded = (value: number) => String(value).padStart(2, "0");
const localAt = (date: Temporal.PlainDate, time: string) => `${date.toString()}T${time.slice(0, 5)}`;

function occurrenceDates(activity: ScheduledActivity, rangeStart: Temporal.PlainDate, rangeEnd: Temporal.PlainDate): Temporal.PlainDate[] {
  const rule = activity.recurrence;
  const anchor = dateOf(activity.startLocal);
  const last = rule?.untilLocal ? Temporal.PlainDate.from(rule.untilLocal.slice(0, 10)) : undefined;
  const interval = Math.max(1, Math.floor(rule?.interval ?? 1));
  const dates: Temporal.PlainDate[] = [];
  if (!rule) {
    return Temporal.PlainDate.compare(anchor, rangeStart) >= 0 && Temporal.PlainDate.compare(anchor, rangeEnd) < 0 ? [anchor] : [];
  }
  let index = 0;

  // Iterating from the series anchor keeps count and interval semantics stable across views.
  for (let date = anchor; Temporal.PlainDate.compare(date, rangeEnd) < 0; date = date.add({ days: 1 })) {
    if (last && Temporal.PlainDate.compare(date, last) > 0) break;
    let matches = false;
    if (rule.frequency === "daily") {
      matches = date.since(anchor, { largestUnit: "day" }).days % interval === 0;
    } else if (rule.frequency === "weekly") {
      const elapsedWeeks = Math.floor(date.since(anchor, { largestUnit: "day" }).days / 7);
      const weekdays = rule.weekdays?.length ? rule.weekdays : [anchor.dayOfWeek];
      matches = elapsedWeeks % interval === 0 && weekdays.includes(date.dayOfWeek);
    } else if (rule.frequency === "monthly") {
      const monthDelta = (date.year - anchor.year) * 12 + date.month - anchor.month;
      const targetDay = Math.min(anchor.day, date.daysInMonth);
      matches = monthDelta >= 0 && monthDelta % interval === 0 && date.day === targetDay;
    } else {
      const yearDelta = date.year - anchor.year;
      const targetDay = Math.min(anchor.day, Temporal.PlainDate.from({ year: date.year, month: anchor.month, day: 1 }).daysInMonth);
      matches = yearDelta >= 0 && yearDelta % interval === 0 && date.month === anchor.month && date.day === targetDay;
    }
    if (matches) {
      index += 1;
      if (rule?.count && index > rule.count) break;
      if (Temporal.PlainDate.compare(date, rangeStart) >= 0) dates.push(date);
    }
  }
  return dates;
}

export function expandActivities(
  activities: readonly ScheduledActivity[],
  rangeStart: string,
  rangeEnd: string,
  overrides: readonly ActivityOccurrenceOverride[] = [],
): ScheduledOccurrence[] {
  const start = Temporal.PlainDate.from(rangeStart.slice(0, 10));
  const end = Temporal.PlainDate.from(rangeEnd.slice(0, 10));
  if (Temporal.PlainDate.compare(start, end) >= 0) throw new RangeError("Occurrence range must be non-empty");
  const overrideMap = new Map(overrides.map((item) => [`${item.activityId}@${item.originalStartLocal}`, item]));
  const result: ScheduledOccurrence[] = [];
  for (const activity of activities) {
    if (activity.status !== "scheduled") continue;
    if (activity.recurrence) {
      const { frequency, interval, weekdays, count } = activity.recurrence;
      if (!("daily weekly monthly yearly".split(" ").includes(frequency)) || !Number.isSafeInteger(interval) || interval < 1 || (count !== undefined && (!Number.isSafeInteger(count) || count < 1)) || (weekdays && weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7))) {
        throw new RangeError("Activity recurrence rule is invalid");
      }
    }
    for (const date of occurrenceDates(activity, start, end)) {
      const originalStartLocal = localAt(date, activity.startLocal.slice(11, 16));
      const override = overrideMap.get(`${activity.id}@${originalStartLocal}`);
      if (override?.status === "complete") continue;
      const startLocal = override?.status === "postponed" && override.startLocal ? override.startLocal : originalStartLocal;
      const effectiveDate = dateOf(startLocal);
      if (Temporal.PlainDate.compare(effectiveDate, start) < 0 || Temporal.PlainDate.compare(effectiveDate, end) >= 0) continue;
      result.push({
        ...activity,
        startLocal,
        status: "scheduled",
        occurrenceKey: `${activity.id}@${originalStartLocal}`,
        originalStartLocal,
        seriesStartLocal: activity.startLocal,
        seriesStatus: activity.status,
      });
    }
  }
  return result.sort((a, b) => a.startLocal.localeCompare(b.startLocal) || a.id.localeCompare(b.id));
}

export function recurrenceRuleFromInput(frequency: string, interval: string, count: string, untilLocal: string, weekdays: number[] = []): RecurrenceRule | undefined {
  if (!frequency) return undefined;
  const parsedInterval = Number(interval);
  const parsedCount = Number(count);
  if (!Number.isSafeInteger(parsedInterval) || parsedInterval < 1 || parsedInterval > 365) throw new RangeError("Recurrence interval must be between 1 and 365");
  if (count.trim() && (!Number.isSafeInteger(parsedCount) || parsedCount < 1)) throw new RangeError("Recurrence count must be a positive whole number");
  return {
    frequency: frequency as RecurrenceRule["frequency"],
    interval: parsedInterval,
    ...(frequency === "weekly" && weekdays.length ? { weekdays: [...new Set(weekdays)].sort((a, b) => a - b) } : {}),
    ...(count.trim() ? { count: parsedCount } : {}),
    ...(untilLocal ? { untilLocal } : {}),
  };
}

export function occurrenceOverrideId(activityId: string, originalStartLocal: string): string {
  return `${activityId}@${originalStartLocal}`;
}

export function postponedLocalTime(originalStartLocal: string, minutes = 15): string {
  const date = activityDateKey(originalStartLocal);
  const time = originalStartLocal.slice(11, 16);
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  const nextDay = Temporal.PlainDate.from(date).add({ days: Math.floor(total / 1440) });
  return `${nextDay.toString()}T${padded(Math.floor((total % 1440) / 60))}:${padded(total % 60)}`;
}
