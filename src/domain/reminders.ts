import type { ReminderLedgerEntry, ScheduledActivity } from "./model";
import { localDateTime } from "./time";

export function dueActivities(
  activities: ScheduledActivity[],
  ledger: ReminderLedgerEntry[],
  now: Date,
): ScheduledActivity[] {
  const alreadyPresented = new Set(ledger.map(({ activityId }) => activityId));
  return activities
    .filter((activity) => activity.status === "scheduled" && activity.alertEnabled && !alreadyPresented.has(activity.id))
    .filter((activity) => localDateTime(activity.startLocal.slice(0, 10), activity.startLocal.slice(11, 16)) <= now)
    .sort((a, b) => a.startLocal.localeCompare(b.startLocal));
}
