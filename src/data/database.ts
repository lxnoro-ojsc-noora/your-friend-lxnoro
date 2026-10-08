import Dexie, { type Table } from "dexie";
import { createStarterTypes } from "./catalog";
import type { ActivityType, Locale, Preferences, ScheduledActivity } from "../domain/model";

export class LxnoroDatabase extends Dexie {
  activityTypes!: Table<ActivityType, string>;
  activities!: Table<ScheduledActivity, string>;
  preferences!: Table<Preferences, string>;

  constructor(name = "your-friend-lxnoro") {
    super(name);
    this.version(1).stores({
      activityTypes: "id, starterKey, createdAt",
      activities: "id, typeId, startLocal, status",
      preferences: "id",
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
    };
    await db.activityTypes.bulkAdd(createStarterTypes());
    await db.preferences.add(defaults);
  });
}
