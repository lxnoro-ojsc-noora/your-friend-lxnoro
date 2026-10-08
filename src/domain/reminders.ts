import type { OccurrenceReminderLedgerEntry, ReminderLedgerEntry, ScheduledActivity } from "./model";
import { activityInstant } from "./time";

export function dueActivities<T extends ScheduledActivity>(
  activities: T[],
  ledger: (ReminderLedgerEntry | OccurrenceReminderLedgerEntry)[],
  now: Date,
): T[] {
  const alreadyPresented = new Set(ledger.map(({ activityId, dueAt }) => `${activityId}@${dueAt}`));
  const due = activities
    .filter((activity) => activity.status === "scheduled" && activity.alertEnabled)
    .filter((activity) => activityInstant(activity.startLocal, activity.timeZone, activity.startUtc) <= now)
    .sort((a, b) => activityInstant(a.startLocal, a.timeZone, a.startUtc).getTime() - activityInstant(b.startLocal, b.timeZone, b.startUtc).getTime());
  const latestRecurring = new Map<string, T>();
  const result: T[] = [];
  for (const activity of due) {
    if (!activity.recurrence) {
      if (!alreadyPresented.has(`${activity.id}@${activity.startLocal}`)) result.push(activity);
      continue;
    }
    const current = latestRecurring.get(activity.id);
    if (!current || activityInstant(activity.startLocal, activity.timeZone, activity.startUtc) > activityInstant(current.startLocal, current.timeZone, current.startUtc)) {
      latestRecurring.set(activity.id, activity);
    }
  }
  for (const activity of latestRecurring.values()) {
    if (!alreadyPresented.has(`${activity.id}@${activity.startLocal}`)) result.push(activity);
  }
  return result.sort((a, b) => activityInstant(a.startLocal, a.timeZone, a.startUtc).getTime() - activityInstant(b.startLocal, b.timeZone, b.startUtc).getTime());
}
