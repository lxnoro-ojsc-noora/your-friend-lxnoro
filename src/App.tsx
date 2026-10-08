import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { database, initializeDatabase } from "./data/database";
import { formatStarterTitle, formatDate, formatTime, translate, type MessageKey } from "./i18n/messages";
import { activityDateKey, activityInstant, addActivityMinutes, horizonBounds, isInRange, localDateKey, minutesIntoDay, nearestQuarterDate } from "./domain/time";
import type { ActivityOccurrenceOverride, ActivityType, Horizon, Locale, OccurrenceReminderLedgerEntry, Preferences, ScheduledActivity, ScheduledOccurrence } from "./domain/model";
import { dueActivities } from "./domain/reminders";
import { expandActivities, occurrenceOverrideId, recurrenceRuleFromInput } from "./domain/recurrence";
import { deliverReminder, requestNotificationPermission } from "./platform/reminderDelivery";
import { BookingSyncCoordinator } from "./platform/bookingSyncCoordinator";

const horizonLabels: Record<Horizon, MessageKey> = {
  day: "day",
  week: "week",
  month: "month",
  year: "year",
  fiveYears: "fiveYears",
};

const localeTag: Record<Locale, string> = { en: "en", ar: "ar" };

function displayTypeTitle(type: ActivityType, locale: Locale): string {
  if (type.titleOverride?.trim()) return type.titleOverride;
  return type.starterKey ? formatStarterTitle(locale, type.starterKey) : "";
}

function localDateTimeInput(date: Date): { date: string; time: string } {
  const rounded = nearestQuarterDate(date);
  return { date: localDateKey(rounded), time: `${String(rounded.getHours()).padStart(2, "0")}:${String(rounded.getMinutes()).padStart(2, "0")}` };
}

function makeId(): string {
  return crypto.randomUUID();
}

function isScheduledOccurrence(activity: ScheduledActivity): activity is ScheduledOccurrence {
  return "occurrenceKey" in activity && "originalStartLocal" in activity && "seriesStartLocal" in activity && "seriesStatus" in activity;
}

function buildBuckets(horizon: Horizon, anchor: Date, locale: Locale) {
  const { start, end } = horizonBounds(horizon, anchor);
  const dates: Date[] = [];
  if (horizon === "week" || horizon === "month") {
    for (const cursor = new Date(start); cursor < end; cursor.setDate(cursor.getDate() + 1)) {
      dates.push(new Date(cursor));
    }
  } else if (horizon === "year") {
    for (let month = 0; month < 12; month += 1) dates.push(new Date(start.getFullYear(), month, 1));
  } else {
    for (let year = 0; year < 5; year += 1) dates.push(new Date(start.getFullYear() + year, 0, 1));
  }

  const buckets = dates.map((date, index) => {
    const bucketEnd = new Date(date);
    if (horizon === "year") bucketEnd.setMonth(bucketEnd.getMonth() + 1);
    else if (horizon === "fiveYears") bucketEnd.setFullYear(bucketEnd.getFullYear() + 1);
    else bucketEnd.setDate(bucketEnd.getDate() + 1);
    let label: string;
    if (horizon === "year") {
      label = new Intl.DateTimeFormat(localeTag[locale], { month: "short" }).format(date);
    } else if (horizon === "fiveYears") {
      label = new Intl.DateTimeFormat(localeTag[locale], { year: "numeric" }).format(date);
    } else {
      label = new Intl.DateTimeFormat(localeTag[locale], { weekday: "short", day: "numeric" }).format(date);
    }
    return { key: `${horizon}-${index}`, date, end: bucketEnd, label };
  });
  return { buckets, start, end };
}

function ActivityDialog({
  kind,
  activityType,
  activity,
  preferences,
  locale,
  onClose,
  onSaveType,
  onSaveActivity,
  onDeleteActivity,
  onCompleteOccurrence,
  onPostponeOccurrence,
}: {
  kind: "type" | "schedule" | "custom" | "profile";
  activityType?: ActivityType;
  activity?: ScheduledActivity;
  preferences?: Preferences;
  locale: Locale;
  onClose: () => void;
  onSaveType: (type: ActivityType) => Promise<void>;
  onSaveActivity: (entry: ScheduledActivity) => Promise<void>;
  onDeleteActivity: (entry: ScheduledActivity) => Promise<void>;
  onCompleteOccurrence: (entry: ScheduledOccurrence) => Promise<void>;
  onPostponeOccurrence: (entry: ScheduledOccurrence) => Promise<void>;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const now = localDateTimeInput(new Date());
  const [title, setTitle] = useState(activity ? activity.title : activityType ? displayTypeTitle(activityType, locale) : "");
  const [symbol, setSymbol] = useState(activity?.symbol ?? activityType?.symbol ?? "✨");
  const [date, setDate] = useState(activity ? activityDateKey(activity.startLocal) : now.date);
  const [time, setTime] = useState(activity?.startLocal.slice(11, 16) ?? now.time);
  const [duration, setDuration] = useState(String(activity?.durationMinutes ?? 30));
  const [notes, setNotes] = useState(activity?.notes ?? "");
  const [alertEnabled, setAlertEnabled] = useState(activity?.alertEnabled ?? true);
  const [frequency, setFrequency] = useState(activity?.recurrence?.frequency ?? "");
  const [interval, setInterval] = useState(String(activity?.recurrence?.interval ?? 1));
  const [count, setCount] = useState(String(activity?.recurrence?.count ?? ""));
  const [untilDate, setUntilDate] = useState(activity?.recurrence?.untilLocal?.slice(0, 10) ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(activity?.recurrence?.weekdays ?? [((new Date(`${activity ? activityDateKey(activity.startLocal) : now.date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1]);
  const [country, setCountry] = useState(preferences?.country ?? "");
  const [city, setCity] = useState(preferences?.city ?? "");
  const [saving, setSaving] = useState(false);
  const noteWords = notes.trim() ? notes.trim().split(/\s+/u).length : 0;

  if (kind === "profile") {
    return (
      <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
          <div className="dialog-heading"><div><span className="eyebrow">{t("settings")}</span><h2 id="dialog-title">{t("location")}</h2></div><button className="icon-button" onClick={onClose} aria-label={t("cancel")}>×</button></div>
          <label>{t("country")}<input value={country} onChange={(event) => setCountry(event.target.value)} maxLength={80} autoFocus /></label>
          <label>{t("city")}<input value={city} onChange={(event) => setCity(event.target.value)} maxLength={80} /></label>
          <p className="muted small-copy">{t("weatherLater")}</p>
          <div className="dialog-actions"><button className="button secondary" onClick={onClose}>{t("cancel")}</button><button className="button primary" onClick={() => { window.dispatchEvent(new CustomEvent("lxnoro:profile", { detail: { country, city } })); onClose(); }}>{t("save")}</button></div>
        </section>
      </div>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (kind === "type" || kind === "custom") {
        const nextType: ActivityType = {
          id: activityType?.id ?? makeId(),
          starterKey: activityType?.starterKey,
          titleOverride: title.trim(),
          symbol: symbol.trim() || "✨",
          createdAt: activityType?.createdAt ?? new Date().toISOString(),
        };
        await onSaveType(nextType);
      } else {
        const selectedType = activityType;
        if (!selectedType) return;
        await onSaveActivity({
          id: activity?.id ?? makeId(),
          typeId: selectedType.id,
          title: title.trim(),
          symbol: symbol.trim() || "✨",
          startLocal: `${date}T${time}`,
          timeZone: activity?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
          durationMinutes: Number(duration),
          status: activity?.status ?? "scheduled",
          notes,
          alertEnabled,
          createdAt: activity?.createdAt ?? new Date().toISOString(),
          ...(recurrenceRuleFromInput(frequency, interval, count, untilDate, weekdays) ? { recurrence: recurrenceRuleFromInput(frequency, interval, count, untilDate, weekdays) } : {}),
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const heading = kind === "type" ? t("editStarter") : kind === "custom" ? t("customActivity") : activity ? t("editScheduled") : t("scheduleActivity");
  return (
    <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-heading"><div><span className="eyebrow">{t("activity")}</span><h2 id="dialog-title">{heading}</h2></div><button className="icon-button" onClick={onClose} aria-label={t("cancel")}>×</button></div>
        <form onSubmit={(event) => void submit(event)}>
          <div className="symbol-title-row">
            <label className="symbol-field">{t("symbol")}<input value={symbol} onChange={(event) => setSymbol(event.target.value)} maxLength={32} required /></label>
            <label className="grow-field">{t("activityName")}<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={90} required autoFocus /></label>
          </div>
          {kind === "schedule" && <div className="form-row"><label>{t("date")}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label>{t("startTime")}<input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></label><label>{t("duration")}<input type="number" value={duration} min={5} max={1440} step={5} onChange={(event) => setDuration(event.target.value)} required /></label></div>}
          {kind === "schedule" && <div className="form-row"><label>{t("repeat")}<select value={frequency} onChange={(event) => setFrequency(event.target.value)}><option value="">{t("never")}</option>{(["daily", "weekly", "monthly", "yearly"] as const).map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>{frequency && <><label>{t("every")}<input type="number" min={1} max={365} value={interval} onChange={(event) => setInterval(event.target.value)} /></label><label>{t("count")} ({t("occurrences")})<input type="number" min={1} value={count} onChange={(event) => setCount(event.target.value)} placeholder="∞" /></label><label>{t("repeatUntil")}<input type="date" min={date} value={untilDate} onChange={(event) => setUntilDate(event.target.value)} /></label></>}</div>}
          {kind === "schedule" && frequency === "weekly" && <fieldset className="form-row"><legend>{t("weekdays")}</legend>{([1, 2, 3, 4, 5, 6, 7] as const).map((day) => <label key={day}><input type="checkbox" checked={weekdays.includes(day)} onChange={(event) => setWeekdays((current) => event.target.checked ? [...current, day].sort((a, b) => a - b) : current.filter((value) => value !== day))} />{t((`weekday${day}`) as MessageKey)}</label>)}</fieldset>}
          {kind === "schedule" && <div className="notes-field"><label htmlFor="activity-notes">{t("notes")}</label><textarea id="activity-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={12000} rows={2} placeholder={t("notesPlaceholder")} aria-describedby="notes-count" /><div className="notes-meta"><span id="notes-count">{noteWords} / 1,000</span>{noteWords > 1000 && <span className="note-limit" role="alert">{t("noteWordLimit")}</span>}</div></div>}
          {kind === "schedule" && <label className="alert-toggle"><input type="checkbox" checked={alertEnabled} onChange={(event) => setAlertEnabled(event.target.checked)} />{t("alertEnabled")}</label>}
          <div className="dialog-actions">
            {activity && <button type="button" className="button danger-ghost" onClick={() => void onDeleteActivity(activity)}>{t("remove")}</button>}
            {activity && isScheduledOccurrence(activity) && <><button type="button" className="button secondary" onClick={() => void onCompleteOccurrence(activity)}>{t("complete")}</button><button type="button" className="button secondary" onClick={() => void onPostponeOccurrence(activity)}>{t("postpone")}</button></>}
            <span className="action-spacer" />
            <button type="button" className="button secondary" onClick={onClose}>{t("cancel")}</button>
            <button type="submit" className="button primary" disabled={saving || noteWords > 1000}>{t("save")}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ReminderDialog({ activity, locale, onDismiss, onComplete }: {
  activity: ScheduledOccurrence;
  locale: Locale;
  onDismiss: () => void;
  onComplete: () => void;
}) {
  const t = (key: MessageKey) => translate(locale, key);
  const instant = activityInstant(activity.startLocal, activity.timeZone);
  return (
    <div className="dialog-backdrop reminder-backdrop">
      <section className="dialog-card reminder-card" role="dialog" aria-modal="true" aria-labelledby="reminder-title">
        <span className="eyebrow">{t("reminderTitle")}</span>
        <div className="reminder-activity"><span className="reminder-symbol">{activity.symbol}</span><div><h2 id="reminder-title">{activity.title}</h2><p>{formatDate(instant, locale, { timeZone: activity.timeZone })} · {formatTime(instant, locale, activity.timeZone)}</p></div></div>
        {activity.notes.trim() ? <div className="reminder-notes"><span className="focus-label">{t("notes")}</span><p>{activity.notes}</p></div> : <p className="muted small-copy">{t("noNotes")}</p>}
        <div className="dialog-actions"><button className="button secondary" onClick={onDismiss}>{t("reminderDismiss")}</button><button className="button primary" onClick={onComplete}>{t("complete")}</button></div>
      </section>
    </div>
  );
}

function DayMatrix({ activities, selectedDate, locale, onSelect, now }: {
  activities: ScheduledOccurrence[];
  selectedDate: string;
  locale: Locale;
  onSelect: (activity: ScheduledActivity) => void;
  now: Date;
}) {
  const current = localDateKey(now) === selectedDate;
  const nowPercent = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100;
  return (
    <div className="matrix-scroll" aria-label={translate(locale, "timeMatrix")}>
      <div className="day-matrix">
        <div className="matrix-axis">
          <div className="axis-label">{translate(locale, "activity")}</div>
          <div className="axis-track">
            {Array.from({ length: 9 }, (_, index) => index * 3).map((hour) => <span className="axis-tick" key={hour} style={{ insetInlineStart: `${(hour / 24) * 100}%` }}>{String(hour).padStart(2, "0")}:00</span>)}
            {current && <span className="now-tag" style={{ insetInlineStart: `${nowPercent}%` }}>{translate(locale, "now")}</span>}
          </div>
        </div>
        {activities.length === 0 ? (
          <div className="empty-lanes" aria-label={translate(locale, "emptyGrid")}>
            <div className="lane-label empty-label"><span className="empty-dash">···</span><span>{translate(locale, "yourTime")}</span></div>
            <div className="lane-track empty-track">{current && <div className="now-line" style={{ insetInlineStart: `${nowPercent}%` }} />}<div className="track-hint">{translate(locale, "emptyGrid")}</div></div>
          </div>
        ) : activities.map((activity) => {
          const startMinutes = minutesIntoDay(activity.startLocal);
          const width = Math.max((Math.min(activity.durationMinutes, 1440 - startMinutes) / 1440) * 100, 1.5);
          return (
            <div className="activity-lane" key={activity.occurrenceKey}>
              <div className="lane-label"><span className="lane-symbol">{activity.symbol}</span><span className="lane-title">{activity.title}</span></div>
              <div className="lane-track">
                {current && <div className="now-line" style={{ insetInlineStart: `${nowPercent}%` }} />}
                <button className="time-block" style={{ insetInlineStart: `${(startMinutes / 1440) * 100}%`, width: `${width}%` }} onClick={() => onSelect(activity)} title={`${activity.title} · ${activity.startLocal.slice(11, 16)}`}>
                  <span>{activity.symbol} {activity.title}</span><small>{activity.startLocal.slice(11, 16)}</small>
                </button>
              </div>
            </div>
          );
        })}
        <div className="axis-bottom"><span>{translate(locale, "midnight")}</span><span>{translate(locale, "nextMidnight")}</span></div>
      </div>
    </div>
  );
}

function HorizonMatrix({ horizon, anchor, activities, locale, onSelect }: {
  horizon: Exclude<Horizon, "day">;
  anchor: Date;
  activities: ScheduledOccurrence[];
  locale: Locale;
  onSelect: (activity: ScheduledActivity) => void;
}) {
  const { buckets } = buildBuckets(horizon, anchor, locale);
  const formatShortTime = (entry: ScheduledActivity) => formatTime(activityInstant(entry.startLocal, entry.timeZone), locale, entry.timeZone);
  return (
    <div className={`horizon-board horizon-${horizon}`} style={{ "--bucket-count": buckets.length } as CSSProperties}>
      {buckets.map((bucket) => {
        const items = activities.filter((entry) => isInRange(entry.startLocal, bucket.date, bucket.end));
        return <section className="horizon-cell" key={bucket.key} aria-label={bucket.label}>
          <header>{bucket.label}</header>
          {items.length ? items.map((entry) => <button className="horizon-activity" key={entry.occurrenceKey} onClick={() => onSelect(entry)}><span>{entry.symbol}</span><strong>{entry.title}</strong><small>{formatShortTime(entry)}</small></button>) : <span className="horizon-empty">·</span>}
        </section>;
      })}
    </div>
  );
}

export function App() {
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [activities, setActivities] = useState<ScheduledActivity[]>([]);
  const [occurrenceOverrides, setOccurrenceOverrides] = useState<ActivityOccurrenceOverride[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [selectedDate, setSelectedDate] = useState(localDateKey(new Date()));
  const [horizon, setHorizon] = useState<Horizon>("day");
  const [now, setNow] = useState(new Date());
  const [dialog, setDialog] = useState<{ kind: "type" | "schedule" | "custom" | "profile"; type?: ActivityType; activity?: ScheduledActivity } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reminderQueue, setReminderQueue] = useState<ScheduledOccurrence[]>([]);
  const [notice, setNotice] = useState("");
  const reminderScanActive = useRef(false);
  const reminderInFlight = useRef(new Set<string>());
  const bookingSync = useRef<BookingSyncCoordinator | null>(null);

  const locale: Locale = preferences?.locale ?? "en";
  const t = (key: MessageKey) => translate(locale, key);
  const selectedDateObject = useMemo(() => {
    const [year = 0, month = 1, day = 1] = selectedDate.split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [selectedDate]);
  const range = useMemo(() => horizonBounds(horizon, selectedDateObject), [horizon, selectedDateObject]);
  const horizonOccurrences = useMemo(() => expandActivities(activities, localDateKey(range.start), localDateKey(range.end), occurrenceOverrides), [activities, occurrenceOverrides, range]);
  const visibleActivities = horizonOccurrences;
  const dayActivities = useMemo(() => expandActivities(activities, selectedDate, new Date(Date.parse(`${selectedDate}T00:00:00`) + 86_400_000).toISOString().slice(0, 10), occurrenceOverrides), [activities, occurrenceOverrides, selectedDate]);
  const nextActivity = useMemo(() => expandActivities(activities, localDateKey(now), new Date(Date.parse(`${localDateKey(now)}T00:00:00`) + 5 * 366 * 86_400_000).toISOString().slice(0, 10), occurrenceOverrides)
    .filter((entry) => activityInstant(entry.startLocal, entry.timeZone) >= now)
    .sort((a, b) => activityInstant(a.startLocal, a.timeZone).getTime() - activityInstant(b.startLocal, b.timeZone).getTime())[0], [activities, occurrenceOverrides, now]);

  const refresh = async () => {
    const [savedTypes, savedActivities, savedPreferences, savedOverrides] = await Promise.all([
      database.activityTypes.toArray(),
      database.activities.toArray(),
      database.preferences.get("main"),
      database.occurrenceOverrides.toArray(),
    ]);
    setTypes(savedTypes.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    setActivities(savedActivities);
    setOccurrenceOverrides(savedOverrides);
    if (savedPreferences) setPreferences(savedPreferences);
  };

  useEffect(() => {
    let active = true;
    void initializeDatabase().then(async () => {
      await refresh();
      if (active && import.meta.env.DEV) {
        const coordinator = new BookingSyncCoordinator({ developmentOwnerId: "local-owner" });
        bookingSync.current = coordinator;
        void coordinator.start();
      }
    }).catch(() => { if (active) setError(translate("en", "storageError")); }).finally(() => { if (active) setLoading(false); });
    const ticker = window.setInterval(() => setNow(new Date()), 30_000);
    const profileListener = (event: Event) => {
      const detail = (event as CustomEvent<{ country: string; city: string }>).detail;
      void database.preferences.update("main", { country: detail.country.trim(), city: detail.city.trim() }).then(refresh).catch(() => setError(t("storageError")));
    };
    window.addEventListener("lxnoro:profile", profileListener);
    return () => { active = false; bookingSync.current?.stop(); bookingSync.current = null; window.clearInterval(ticker); window.removeEventListener("lxnoro:profile", profileListener); };
  }, []);

  useEffect(() => {
    if (loading) return;
    let active = true;
    const scan = async () => {
      if (!active || reminderScanActive.current || document.visibilityState === "hidden") return;
      reminderScanActive.current = true;
      try {
        const [legacyLedger, occurrenceLedger] = await Promise.all([database.reminderLedger.toArray(), database.occurrenceReminderLedger.toArray()]);
        const ledger = [...legacyLedger, ...occurrenceLedger];
        const startDate = activities.length ? activities.map((entry) => activityDateKey(entry.startLocal)).sort()[0] as string : localDateKey(new Date());
        const today = localDateKey(new Date());
        const throughTomorrow = new Date(Date.parse(`${today}T00:00:00`) + 86_400_000).toISOString().slice(0, 10);
        const due = dueActivities(expandActivities(activities, startDate, throughTomorrow, occurrenceOverrides), ledger, new Date()).filter((activity) => !reminderInFlight.current.has(activity.occurrenceKey));
        if (due.length) {
          due.forEach(({ occurrenceKey }) => reminderInFlight.current.add(occurrenceKey));
          const presentedAt = new Date().toISOString();
          const entries: OccurrenceReminderLedgerEntry[] = due.map((activity) => ({ occurrenceKey: activity.occurrenceKey, activityId: activity.id, dueAt: activity.startLocal, presentedAt }));
          await database.occurrenceReminderLedger.bulkPut(entries);
          if (active) setReminderQueue((queue) => [...queue, ...due]);
          await Promise.all(due.map((activity) => deliverReminder(activity)));
        }
      } catch {
        reminderInFlight.current.clear();
        if (active) setError(translate("en", "storageError"));
      } finally {
        reminderScanActive.current = false;
      }
    };
    const firstScan = window.setTimeout(() => void scan(), 0);
    const timer = window.setInterval(() => void scan(), 30_000);
    const onResume = () => { if (document.visibilityState !== "hidden") void scan(); };
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => { active = false; window.clearTimeout(firstScan); window.clearInterval(timer); window.removeEventListener("focus", onResume); document.removeEventListener("visibilitychange", onResume); };
  }, [activities, occurrenceOverrides, loading]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.title = t("product");
  }, [locale]);

  const saveActivityType = async (type: ActivityType) => {
    try { await database.activityTypes.put(type); await refresh(); setError(""); }
    catch { setError(t("storageError")); }
  };

  const saveActivity = async (entry: ScheduledActivity) => {
    try {
      const existing = await database.activities.get(entry.id);
      await database.transaction("rw", database.activities, database.reminderLedger, database.occurrenceOverrides, database.occurrenceReminderLedger, async () => {
        await database.activities.put(entry);
        if (!existing || existing.startLocal !== entry.startLocal || existing.status !== entry.status || existing.alertEnabled !== entry.alertEnabled) {
          await database.reminderLedger.delete(entry.id);
          for (const key of reminderInFlight.current) if (key.startsWith(`${entry.id}@`)) reminderInFlight.current.delete(key);
        }
        if (existing && (existing.startLocal !== entry.startLocal || JSON.stringify(existing.recurrence) !== JSON.stringify(entry.recurrence))) {
          await database.occurrenceOverrides.where("activityId").equals(entry.id).delete();
          await database.occurrenceReminderLedger.where("activityId").equals(entry.id).delete();
        }
      });
      await refresh(); setError("");
      void bookingSync.current?.projectionChanged();
    }
    catch { setError(t("storageError")); }
  };

  const deleteType = async (type: ActivityType) => {
    if (!window.confirm(t("removeConfirm"))) return;
    try { await database.activityTypes.delete(type.id); await refresh(); }
    catch { setError(t("storageError")); }
  };

  const deleteActivity = async (entry: ScheduledActivity) => {
    try { await database.transaction("rw", database.activities, database.occurrenceOverrides, database.occurrenceReminderLedger, async () => { await database.activities.delete(entry.id); await database.occurrenceOverrides.where("activityId").equals(entry.id).delete(); await database.occurrenceReminderLedger.where("activityId").equals(entry.id).delete(); }); await refresh(); setDialog(null); void bookingSync.current?.projectionChanged(); }
    catch { setError(t("storageError")); }
  };

  const completeOccurrence = async (occurrence: ScheduledOccurrence) => {
    try {
      if (!occurrence.recurrence) {
        const base = await database.activities.get(occurrence.id);
        if (base) await saveActivity({ ...base, status: "complete" });
      } else {
        const override: ActivityOccurrenceOverride = { id: occurrenceOverrideId(occurrence.id, occurrence.originalStartLocal), activityId: occurrence.id, originalStartLocal: occurrence.originalStartLocal, status: "complete", updatedAt: new Date().toISOString() };
        await database.occurrenceOverrides.put(override);
        await refresh();
        void bookingSync.current?.projectionChanged();
      }
      reminderInFlight.current.delete(occurrence.occurrenceKey);
      setDialog(null);
    } catch { setError(t("storageError")); }
  };

  const postponeOccurrence = async (occurrence: ScheduledOccurrence) => {
    try {
      const nextStart = addActivityMinutes(occurrence.startLocal, occurrence.timeZone, 15);
      if (!occurrence.recurrence) {
        const base = await database.activities.get(occurrence.id);
        if (base) await saveActivity({ ...base, startLocal: nextStart });
      } else {
        const override: ActivityOccurrenceOverride = { id: occurrenceOverrideId(occurrence.id, occurrence.originalStartLocal), activityId: occurrence.id, originalStartLocal: occurrence.originalStartLocal, status: "postponed", startLocal: nextStart, updatedAt: new Date().toISOString() };
        await database.occurrenceOverrides.put(override);
        await refresh();
        void bookingSync.current?.projectionChanged();
      }
      reminderInFlight.current.delete(occurrence.occurrenceKey);
      setDialog(null);
    } catch { setError(t("storageError")); }
  };

  const selectLanguage = async (nextLocale: Locale) => {
    if (!preferences) return;
    const next = { ...preferences, locale: nextLocale };
    try { await database.preferences.put(next); setPreferences(next); }
    catch { setError(t("storageError")); }
  };

  const enableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotice(permission === "granted" ? t("notificationEnabled") : permission === "denied" ? t("notificationDenied") : t("notificationUnsupported"));
  };

  const dismissReminder = () => setReminderQueue((queue) => queue.slice(1));
  const completeReminder = async (activity: ScheduledOccurrence) => {
    await completeOccurrence(activity);
    setReminderQueue((queue) => queue.filter(({ occurrenceKey }) => occurrenceKey !== activity.occurrenceKey));
  };

  const activeReminder = reminderQueue[0];

  const openSchedule = (type: ActivityType) => setDialog({ kind: "schedule", type });

  if (loading || !preferences) return <main className="loading-shell"><span className="brand-mark">LX</span><p>{translate("en", "loading")}</p></main>;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup"><span className="brand-mark">LX</span><div><p className="brand-name">{t("product")}</p><p className="brand-subtitle">{t("companion")}</p></div></div>
        <div className="topbar-actions">
          <button className="profile-chip" onClick={() => setDialog({ kind: "profile" })} aria-label={t("location")}><span className="status-dot" />{preferences.city ? `${preferences.city}${preferences.country ? `, ${preferences.country}` : ""}` : t("addLocation")}</button>
          <button className="notification-button" onClick={() => void enableNotifications()}>{t("enableNotifications")}</button>
          <div className="language-switch" aria-label={t("language")}><button aria-pressed={locale === "en"} onClick={() => void selectLanguage("en")}>EN</button><button aria-pressed={locale === "ar"} onClick={() => void selectLanguage("ar")}>ع</button></div>
        </div>
      </header>

      <section className="hero-row">
        <div><span className="eyebrow">{t("currentDay")}</span><h1>{formatDate(now, locale)}</h1><p className="muted">{t("horizonIntro")}</p></div>
        <div className="clock-card"><span className="clock-pulse" /><div><span className="clock-label">{t("now")}</span><strong>{formatTime(now, locale)}</strong></div></div>
      </section>

      <nav className="horizon-nav" aria-label={t("planningHorizons")}>
        {(Object.keys(horizonLabels) as Horizon[]).map((item) => <button key={item} className={horizon === item ? "horizon-tab active" : "horizon-tab"} aria-pressed={horizon === item} onClick={() => setHorizon(item)}>{t(horizonLabels[item])}</button>)}
        <span className="horizon-summary">{formatDate(range.start, locale, { weekday: undefined })}</span>
      </nav>

      <section className="focus-row" aria-label={`${t("now")} and ${t("next")}`}>
        <article className="focus-card now-card"><span className="focus-symbol">◉</span><div><span className="focus-label">{t("now")}</span><strong>{formatTime(now, locale)}</strong></div><span className="focus-live">{t("live")}</span></article>
        <article className="focus-card next-card"><span className="focus-symbol">↗</span><div className="next-content"><span className="focus-label">{t("next")}</span>{nextActivity ? <strong>{nextActivity.symbol} {nextActivity.title}<small>{formatTime(activityInstant(nextActivity.startLocal, nextActivity.timeZone), locale, nextActivity.timeZone)}</small></strong> : <strong className="muted">{t("nothingNext")}</strong>}</div></article>
      </section>

      {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError("")} aria-label={t("dismiss")}>×</button></div>}
      {notice && <div className="notice-banner" role="status">{notice}<button onClick={() => setNotice("")} aria-label={t("dismiss")}>×</button></div>}

      <section className="matrix-panel panel">
        <div className="section-heading matrix-heading"><div><span className="eyebrow">{t("timeStructure")}</span><h2>{horizon === "day" ? t("today") : t(horizonLabels[horizon])}</h2><p className="muted">{formatDate(selectedDateObject, locale)}</p></div>
          <div className="matrix-actions"><label className="date-picker-label"><span>{t("selectDate")}</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} aria-label={t("selectDate")} /></label><button className="button primary" onClick={() => setDialog({ kind: "custom" })}>＋ {visibleActivities.length === 0 ? t("addFirst") : t("addActivity")}</button></div>
        </div>
        {horizon === "day" ? <DayMatrix activities={dayActivities} selectedDate={selectedDate} locale={locale} now={now} onSelect={(activity) => setDialog({ kind: "schedule", type: types.find((type) => type.id === activity.typeId), activity })} /> : <HorizonMatrix horizon={horizon} anchor={selectedDateObject} activities={visibleActivities} locale={locale} onSelect={(activity) => setDialog({ kind: "schedule", type: types.find((type) => type.id === activity.typeId), activity })} />}
        {visibleActivities.length === 0 && <p className="empty-state-copy">{t("emptyHorizon")}</p>}
      </section>

      <section className="starter-panel panel">
        <div className="section-heading starter-heading"><div><span className="eyebrow">{t("readyToShape")}</span><h2>{t("starterHeading")}</h2><p className="muted">{t("starterDescription")}</p></div><button className="button secondary" onClick={() => setDialog({ kind: "custom" })}>＋ {t("customActivity")}</button></div>
        <div className="starter-grid">
          {types.map((type) => <article className="starter-card" key={type.id}>
            <button className="starter-main" onClick={() => openSchedule(type)} aria-label={`${t("schedule")} ${displayTypeTitle(type, locale)}`}><span className="starter-symbol">{type.symbol}</span><span className="starter-title">{displayTypeTitle(type, locale)}</span><span className="starter-schedule">{t("schedule")} <span aria-hidden="true">↗</span></span></button>
            <div className="starter-tools"><button onClick={() => setDialog({ kind: "type", type })}>{t("edit")}</button><button className="remove-link" onClick={() => void deleteType(type)}>{t("remove")}</button></div>
          </article>)}
        </div>
      </section>

      <footer className="app-footer"><span><span className="privacy-dot" />{t("saved")}</span><span>{preferences.city ? `${preferences.city}${preferences.country ? `, ${preferences.country}` : ""}` : t("locationNotSet")}</span></footer>

      {dialog && <ActivityDialog kind={dialog.kind} activityType={dialog.type} activity={dialog.activity} preferences={preferences} locale={locale} onClose={() => setDialog(null)} onSaveType={saveActivityType} onSaveActivity={saveActivity} onDeleteActivity={deleteActivity} onCompleteOccurrence={completeOccurrence} onPostponeOccurrence={postponeOccurrence} />}
      {activeReminder && <ReminderDialog activity={activeReminder} locale={locale} onDismiss={dismissReminder} onComplete={() => void completeReminder(activeReminder)} />}
    </main>
  );
}
