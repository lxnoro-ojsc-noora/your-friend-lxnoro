export type Locale = "en" | "ar";

export type Horizon = "day" | "week" | "month" | "year" | "fiveYears";

export interface ActivityType {
  id: string;
  starterKey?: string;
  titleOverride?: string;
  symbol: string;
  createdAt: string;
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  /** ISO weekdays (Monday=1 through Sunday=7), used for weekly rules. */
  weekdays?: number[];
  count?: number;
  untilLocal?: string;
}

export interface ScheduledActivity {
  id: string;
  typeId: string;
  title: string;
  symbol: string;
  startLocal: string;
  timeZone: string;
  durationMinutes: number;
  status: "scheduled" | "complete";
  notes: string;
  alertEnabled: boolean;
  createdAt: string;
  recurrence?: RecurrenceRule;
}

export interface ActivityOccurrenceOverride {
  id: string;
  activityId: string;
  originalStartLocal: string;
  status: "complete" | "postponed";
  startLocal?: string;
  updatedAt: string;
}

export interface ScheduledOccurrence extends ScheduledActivity {
  occurrenceKey: string;
  originalStartLocal: string;
  seriesStartLocal: string;
  seriesStatus: ScheduledActivity["status"];
}

export interface ReminderLedgerEntry {
  activityId: string;
  dueAt: string;
  presentedAt: string;
}

export interface OccurrenceReminderLedgerEntry {
  occurrenceKey: string;
  activityId: string;
  dueAt: string;
  presentedAt: string;
}

export interface Preferences {
  id: "main";
  locale: Locale;
  country: string;
  city: string;
  timeZone: string;
  startersInitialized: boolean;
}

export interface StarterDefinition {
  key: string;
  symbol: string;
  messageKey: string;
}
