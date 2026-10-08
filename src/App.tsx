import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { database, initializeDatabase } from "./data/database";
import { formatStarterTitle, formatDate, formatTime, translate, type MessageKey } from "./i18n/messages";
import { activityDateKey, activityInstant, horizonBounds, isInRange, localDateKey, minutesIntoDay, nearestQuarterDate } from "./domain/time";
import type { ActivityType, Horizon, Locale, Preferences, ScheduledActivity } from "./domain/model";
import { dueActivities } from "./domain/reminders";
import { deliverReminder, requestNotificationPermission } from "./platform/reminderDelivery";

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
          {kind === "schedule" && <div className="notes-field"><label htmlFor="activity-notes">{t("notes")}</label><textarea id="activity-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={12000} rows={2} placeholder={t("notesPlaceholder")} aria-describedby="notes-count" /><div className="notes-meta"><span id="notes-count">{noteWords} / 1,000</span>{noteWords > 1000 && <span className="note-limit" role="alert">{t("noteWordLimit")}</span>}</div></div>}
          {kind === "schedule" && <label className="alert-toggle"><input type="checkbox" checked={alertEnabled} onChange={(event) => setAlertEnabled(event.target.checked)} />{t("alertEnabled")}</label>}
          <div className="dialog-actions">
            {activity && <button type="button" className="button danger-ghost" onClick={() => void onDeleteActivity(activity)}>{t("remove")}</button>}
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
  activity: ScheduledActivity;
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
  activities: ScheduledActivity[];
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
            <div className="activity-lane" key={activity.id}>
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
  activities: ScheduledActivity[];
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
          {items.length ? items.map((entry) => <button className="horizon-activity" key={entry.id} onClick={() => onSelect(entry)}><span>{entry.symbol}</span><strong>{entry.title}</strong><small>{formatShortTime(entry)}</small></button>) : <span className="horizon-empty">·</span>}
        </section>;
      })}
    </div>
  );
}

export function App() {
  const [types, setTypes] = useState<ActivityType[]>([]);
  const [activities, setActivities] = useState<ScheduledActivity[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [selectedDate, setSelectedDate] = useState(localDateKey(new Date()));
  const [horizon, setHorizon] = useState<Horizon>("day");
  const [now, setNow] = useState(new Date());
  const [dialog, setDialog] = useState<{ kind: "type" | "schedule" | "custom" | "profile"; type?: ActivityType; activity?: ScheduledActivity } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reminderQueue, setReminderQueue] = useState<ScheduledActivity[]>([]);
  const [notice, setNotice] = useState("");
  const reminderScanActive = useRef(false);
  const reminderInFlight = useRef(new Set<string>());

  const locale: Locale = preferences?.locale ?? "en";
  const t = (key: MessageKey) => translate(locale, key);
  const selectedDateObject = useMemo(() => {
    const [year = 0, month = 1, day = 1] = selectedDate.split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [selectedDate]);
  const range = useMemo(() => horizonBounds(horizon, selectedDateObject), [horizon, selectedDateObject]);
  const visibleActivities = useMemo(() => activities.filter((entry) => isInRange(entry.startLocal, range.start, range.end)), [activities, range]);
  const dayActivities = useMemo(() => activities.filter((entry) => activityDateKey(entry.startLocal) === selectedDate).sort((a, b) => activityInstant(a.startLocal, a.timeZone).getTime() - activityInstant(b.startLocal, b.timeZone).getTime()), [activities, selectedDate]);
  const nextActivity = useMemo(() => activities
    .filter((entry) => entry.status === "scheduled" && activityInstant(entry.startLocal, entry.timeZone) >= now)
    .sort((a, b) => activityInstant(a.startLocal, a.timeZone).getTime() - activityInstant(b.startLocal, b.timeZone).getTime())[0], [activities, now]);

  const refresh = async () => {
    const [savedTypes, savedActivities, savedPreferences] = await Promise.all([
      database.activityTypes.toArray(),
      database.activities.toArray(),
      database.preferences.get("main"),
    ]);
    setTypes(savedTypes.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    setActivities(savedActivities);
    if (savedPreferences) setPreferences(savedPreferences);
  };

  useEffect(() => {
    let active = true;
    void initializeDatabase().then(refresh).catch(() => { if (active) setError(translate("en", "storageError")); }).finally(() => { if (active) setLoading(false); });
    const ticker = window.setInterval(() => setNow(new Date()), 30_000);
    const profileListener = (event: Event) => {
      const detail = (event as CustomEvent<{ country: string; city: string }>).detail;
      void database.preferences.update("main", { country: detail.country.trim(), city: detail.city.trim() }).then(refresh).catch(() => setError(t("storageError")));
    };
    window.addEventListener("lxnoro:profile", profileListener);
    return () => { active = false; window.clearInterval(ticker); window.removeEventListener("lxnoro:profile", profileListener); };
  }, []);

  useEffect(() => {
    if (loading) return;
    let active = true;
    const scan = async () => {
      if (!active || reminderScanActive.current || document.visibilityState === "hidden") return;
      reminderScanActive.current = true;
      try {
        const ledger = await database.reminderLedger.toArray();
        const due = dueActivities(activities, ledger, new Date()).filter((activity) => !reminderInFlight.current.has(activity.id));
        if (due.length) {
          due.forEach(({ id }) => reminderInFlight.current.add(id));
          await database.reminderLedger.bulkPut(due.map((activity) => ({ activityId: activity.id, dueAt: activity.startLocal, presentedAt: new Date().toISOString() })));
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
  }, [activities, loading]);

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
      await database.transaction("rw", database.activities, database.reminderLedger, async () => {
        await database.activities.put(entry);
        if (!existing || existing.startLocal !== entry.startLocal || existing.status !== entry.status || existing.alertEnabled !== entry.alertEnabled) {
          await database.reminderLedger.delete(entry.id);
          reminderInFlight.current.delete(entry.id);
        }
      });
      await refresh(); setError("");
    }
    catch { setError(t("storageError")); }
  };

  const deleteType = async (type: ActivityType) => {
    if (!window.confirm(t("removeConfirm"))) return;
    try { await database.activityTypes.delete(type.id); await refresh(); }
    catch { setError(t("storageError")); }
  };

  const deleteActivity = async (entry: ScheduledActivity) => {
    try { await database.activities.delete(entry.id); await refresh(); setDialog(null); }
    catch { setError(t("storageError")); }
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
  const completeReminder = async (activity: ScheduledActivity) => {
    await saveActivity({ ...activity, status: "complete" });
    setReminderQueue((queue) => queue.filter(({ id }) => id !== activity.id));
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

      {dialog && <ActivityDialog kind={dialog.kind} activityType={dialog.type} activity={dialog.activity} preferences={preferences} locale={locale} onClose={() => setDialog(null)} onSaveType={saveActivityType} onSaveActivity={saveActivity} onDeleteActivity={deleteActivity} />}
      {activeReminder && <ReminderDialog activity={activeReminder} locale={locale} onDismiss={dismissReminder} onComplete={() => void completeReminder(activeReminder)} />}
    </main>
  );
}
