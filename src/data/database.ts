import Dexie, { type Table } from "dexie";
import { createStarterTypes } from "./catalog";
import type { BookingSyncOutboxRecord } from "./bookingSync";
import type { WeatherCacheRecord } from "./weatherCache";
import type { ConfirmedAppointmentProjection } from "../domain/confirmedAppointment";
import type { ActivityOccurrenceOverride, ActivityType, Locale, OccurrenceReminderLedgerEntry, Preferences, ReminderLedgerEntry, ScheduledActivity } from "../domain/model";

export class LxnoroDatabase extends Dexie {
  activityTypes!: Table<ActivityType, string>;
  activities!: Table<ScheduledActivity, string>;
  preferences!: Table<Preferences, string>;
  reminderLedger!: Table<ReminderLedgerEntry, string>;
  bookingSyncOutbox!: Table<BookingSyncOutboxRecord, string>;
  occurrenceOverrides!: Table<ActivityOccurrenceOverride, string>;
  occurrenceReminderLedger!: Table<OccurrenceReminderLedgerEntry, string>;
  weatherCache!: Table<WeatherCacheRecord, string>;
  confirmedBookingAppointments!: Table<ConfirmedAppointmentProjection, string>;

  constructor(name = "your-friend-lxnoro") {
    super(name);
    this.version(2).stores({
      activityTypes: "id, starterKey, createdAt",
      activities: "id, typeId, startLocal, status",
      preferences: "id",
      reminderLedger: "activityId, dueAt",
    });
    this.version(3).stores({
      activityTypes: "id, starterKey, createdAt",
      activities: "id, typeId, startLocal, status",
      preferences: "id",
      reminderLedger: "activityId, dueAt",
      bookingSyncOutbox: "id",
    });
    this.version(4).stores({
      activityTypes: "id, starterKey, createdAt",
      activities: "id, typeId, startLocal, status",
      preferences: "id",
      reminderLedger: "activityId, dueAt",
      bookingSyncOutbox: "id",
      occurrenceOverrides: "id, activityId, originalStartLocal, status",
    });
    this.version(5).stores({
      activityTypes: "id, starterKey, createdAt",
      activities: "id, typeId, startLocal, status",
      preferences: "id",
      reminderLedger: "activityId, dueAt",
      bookingSyncOutbox: "id",
      occurrenceOverrides: "id, activityId, originalStartLocal, status",
      occurrenceReminderLedger: "occurrenceKey, activityId, dueAt",
    });
    this.version(6).stores({
      activityTypes: "id, starterKey, createdAt",
      activities: "id, typeId, startLocal, status",
      preferences: "id",
      reminderLedger: "activityId, dueAt",
      bookingSyncOutbox: "id",
      occurrenceOverrides: "id, activityId, originalStartLocal, status",
      occurrenceReminderLedger: "occurrenceKey, activityId, dueAt",
      weatherCache: "id, updatedAt",
    });
    this.version(7).stores({
      activityTypes: "id, starterKey, createdAt",
      activities: "id, typeId, startLocal, status",
      preferences: "id",
      reminderLedger: "activityId, dueAt",
      bookingSyncOutbox: "id",
      occurrenceOverrides: "id, activityId, originalStartLocal, status",
      occurrenceReminderLedger: "occurrenceKey, activityId, dueAt",
      weatherCache: "id, updatedAt",
      confirmedBookingAppointments: "id, startUtc, endUtc",
    });
  }
}

export const database = new LxnoroDatabase();

export function browserLocale(): Locale {
  return navigator.language.toLowerCase().startsWith("ar") ? "ar" : "en";
}

export async function initializeDatabase(db: LxnoroDatabase = database): Promise<void> {
  await db.transaction("rw", db.activityTypes, db.preferences, async () => {
    const existing = await db.preferences.get("main");
    if (existing) return;

    const defaults: Preferences = {
      id: "main",
      locale: typeof navigator === "undefined" ? "en" : browserLocale(),
      country: "",
      city: "",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      startersInitialized: true,
      weatherEnabled: false,
    };
    await db.activityTypes.bulkPut(createStarterTypes());
    await db.preferences.add(defaults);
  });
}
