export type Locale = "en" | "ar";

export type Horizon = "day" | "week" | "month" | "year" | "fiveYears";

export interface ActivityType {
  id: string;
  starterKey?: string;
  titleOverride?: string;
  symbol: string;
  createdAt: string;
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
