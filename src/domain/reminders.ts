import type { ReminderLedgerEntry, ScheduledActivity } from "./model";
import { activityInstant } from "./time";

export function dueActivities(
  activities: ScheduledActivity[],
  ledger: ReminderLedgerEntry[],
  now: Date,
): ScheduledActivity[] {
  const alreadyPresented = new Set(ledger.map(({ activityId }) => activityId));
  return activities
    .filter((activity) => activity.status === "scheduled" && activity.alertEnabled && !alreadyPresented.has(activity.id))
    .filter((activity) => activityInstant(activity.startLocal, activity.timeZone) <= now)
    .sort((a, b) => activityInstant(a.startLocal, a.timeZone).getTime() - activityInstant(b.startLocal, b.timeZone).getTime());
}
