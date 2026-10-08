import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { createBookingLinkId, type BookingLinkId, type OwnerAvailabilityConfiguration, type WeeklyAvailabilityWindow } from "../domain/booking";
import type { Locale, Preferences } from "../domain/model";
import { translate } from "../i18n/messages";
import { decideBookingRequest, getPublicAvailability, listPendingBookingRequests, saveOwnerBookingConfiguration, submitPublicBookingRequest, type OwnerBookingConfiguration, type OwnerBookingRequest, type PublicSlot } from "../platform/bookingClient";

const words = {
  en: { manage:"Booking", title:"Shared booking", intro:"Share available times without revealing your private schedule.", close:"Close", enabled:"Booking link enabled", disabled:"Link disabled", durations:"Allowed durations (minutes)", weekdays:"Availability windows", addWindow:"Add window", remove:"Remove", weekday:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], start:"From", end:"To", notice:"Minimum notice (minutes)", max:"Maximum advance (minutes; blank = no limit)", before:"Buffer before (minutes)", after:"Buffer after (minutes)", zone:"Availability time zone", expiry:"Link expiry (optional UTC)", save:"Save settings", link:"Shareable link", copy:"Copy link", copied:"Copied", pending:"Pending requests", empty:"No pending requests.", approve:"Approve", reject:"Reject", requester:"Requester", requested:"Requested time", note:"Message", failed:"Booking service unavailable. Local planning is unaffected.", saveSuccess:"Booking settings saved.", approvalError:"Could not approve this slot. It may no longer be available.", requestError:"Could not complete the booking request.", publicTitle:"Request an appointment", publicIntro:"Choose an available time. Only open booking times are shown.", day:"Day", time:"Available time", duration:"Duration", fullName:"Full name", email:"Email address", optionalNote:"Optional short note", send:"Send booking request", pendingAck:"Request sent. It is Pending until the owner reviews it.", noSlots:"No available times for this day.", loadSlots:"Could not load availability. Try again while online.", private:"The owner's schedule details remain private.", language:"Language" },
  ar: { manage:"الحجوزات", title:"حجز المواعيد", intro:"شارك الأوقات المتاحة دون كشف جدولك الخاص.", close:"إغلاق", enabled:"رابط الحجز مفعّل", disabled:"الرابط معطّل", durations:"المدد المسموحة (دقائق)", weekdays:"نوافذ التوفر", addWindow:"إضافة فترة", remove:"إزالة", weekday:["الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت","الأحد"], start:"من", end:"إلى", notice:"أقل مهلة مسبقة (دقائق)", max:"أقصى مدة للحجز المسبق (دقائق؛ فارغ = بلا حد)", before:"فاصل قبل الموعد (دقائق)", after:"فاصل بعد الموعد (دقائق)", zone:"المنطقة الزمنية للتوفر", expiry:"انتهاء الرابط (UTC، اختياري)", save:"حفظ الإعدادات", link:"رابط المشاركة", copy:"نسخ الرابط", copied:"تم النسخ", pending:"الطلبات المعلّقة", empty:"لا توجد طلبات معلّقة.", approve:"موافقة", reject:"رفض", requester:"مقدّم الطلب", requested:"الوقت المطلوب", note:"رسالة", failed:"خدمة الحجز غير متاحة. يظل التخطيط المحلي متاحاً.", saveSuccess:"تم حفظ إعدادات الحجز.", approvalError:"تعذرت الموافقة؛ ربما لم يعد الوقت متاحاً.", requestError:"تعذر إكمال طلب الحجز.", publicTitle:"طلب موعد", publicIntro:"اختر وقتاً متاحاً. تظهر أوقات الحجز المفتوحة فقط.", day:"اليوم", time:"الوقت المتاح", duration:"المدة", fullName:"الاسم الكامل", email:"البريد الإلكتروني", optionalNote:"رسالة قصيرة اختيارية", send:"إرسال طلب الحجز", pendingAck:"تم إرسال الطلب. حالته معلّقة حتى يراجعه المالك.", noSlots:"لا توجد أوقات متاحة لهذا اليوم.", loadSlots:"تعذر تحميل التوفر. أعد المحاولة عند الاتصال بالإنترنت.", private:"تبقى تفاصيل جدول المالك خاصة.", language:"اللغة" },
} as const;
type Words = typeof words.en;
function w(locale: Locale, key: keyof Words): string { const value = words[locale][key]; return Array.isArray(value) ? value.join(" ") : value as string; }
function weekday(locale: Locale, day: number): string { return words[locale].weekday[day - 1] ?? String(day); }
function slotTime(iso: string, locale: Locale, timeZone: string): string { return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { dateStyle:"medium", timeStyle:"short", timeZone }).format(new Date(iso)); }
function currentDay(timeZone: string): string { return Temporal.Now.instant().toZonedDateTimeISO(timeZone).toPlainDate().toString(); }

interface OwnerBookingPanelProps {
  preferences: Preferences; locale: Locale; onClose: () => void; onConfirmed: () => Promise<void>; onLinkSaved: (id: string) => void;
}
export function OwnerBookingPanel({ preferences, locale, onClose, onConfirmed, onLinkSaved }: OwnerBookingPanelProps) {
  const text = (key: keyof Words) => w(locale, key);
  const [config, setConfig] = useState<OwnerBookingConfiguration>({ enabled:true, allowedDurationsMinutes:[30], windows:[], minimumNoticeMinutes:60, bufferBeforeMinutes:0, bufferAfterMinutes:0, timeZone:preferences.timeZone || "UTC" });
  const [linkId, setLinkId] = useState(preferences.bookingLinkId);
  const [requests, setRequests] = useState<OwnerBookingRequest[]>([]);
  const [error, setError] = useState(""); const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false);
  const days = Array.from({ length:7 }, (_, index) => index + 1);
  useEffect(() => { let active = true; void Promise.all([
    listPendingBookingRequests().catch(() => []),
    fetch("/api/owner/booking/configuration", { headers:{ "x-lxnoro-dev-owner-id":"local-owner" } }).then(async (response) => response.ok ? response.json() as Promise<OwnerBookingConfiguration> : undefined).catch(() => undefined),
  ]).then(([pending, saved]) => { if (!active) return; setRequests(pending); if (saved) setConfig(saved); }); return () => { active = false; }; }, []);
  const updateWindow = (index: number, next: Partial<WeeklyAvailabilityWindow>) => setConfig((current) => ({ ...current, windows:current.windows.map((item, i) => i === index ? { ...item, ...next } : item) }));
  const save = async () => {
    setBusy(true); setError("");
    try {
      const id = linkId ?? createBookingLinkId();
      const canonical = { ...config, bookingLinkId:id as BookingLinkId } as OwnerAvailabilityConfiguration;
      await saveOwnerBookingConfiguration(canonical);
      await databasePreference(linkId === id ? undefined : id);
      onLinkSaved(id);
      setLinkId(id); setStatus(text("saveSuccess"));
    } catch { setError(text("failed")); } finally { setBusy(false); }
  };
  const decide = async (request: OwnerBookingRequest, decision: "approved"|"rejected") => {
    setBusy(true); setError("");
    try {
      await decideBookingRequest(request.id, decision);
      setRequests((items) => items.filter((item) => item.id !== request.id));
      if (decision === "approved") await onConfirmed();
    } catch { setError(decision === "approved" ? text("approvalError") : text("failed")); }
    finally { setBusy(false); }
  };
  const shareUrl = linkId ? `${window.location.origin}/book/${encodeURIComponent(linkId)}` : "";
  return <div className="booking-overlay" role="presentation"><section className="booking-panel panel" role="dialog" aria-modal="true" aria-labelledby="booking-title" dir={locale === "ar" ? "rtl" : "ltr"}>
    <header className="dialog-heading"><div><span className="eyebrow">{text("manage")}</span><h2 id="booking-title">{text("title")}</h2><p className="muted">{text("intro")}</p></div><button className="icon-button" onClick={onClose} aria-label={text("close")}>×</button></header>
    {error && <p className="booking-error" role="alert">{error}</p>}{status && <p className="booking-success" role="status">{status}</p>}
    <label className="booking-toggle"><input type="checkbox" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled:e.target.checked })}/>{config.enabled ? text("enabled") : text("disabled")}</label>
    <div className="booking-grid">
      <label>{text("durations")}<input value={config.allowedDurationsMinutes.join(", ")} onChange={(e) => setConfig({ ...config, allowedDurationsMinutes:e.target.value.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0) })}/></label>
      <label>{text("notice")}<input type="number" min="0" value={config.minimumNoticeMinutes} onChange={(e) => setConfig({ ...config, minimumNoticeMinutes:Number(e.target.value) })}/></label>
      <label>{text("max")}<input type="number" min="1" value={config.maximumAdvanceMinutes ?? ""} onChange={(e) => setConfig({ ...config, maximumAdvanceMinutes:e.target.value ? Number(e.target.value) : undefined })}/></label>
      <label>{text("before")}<input type="number" min="0" value={config.bufferBeforeMinutes} onChange={(e) => setConfig({ ...config, bufferBeforeMinutes:Number(e.target.value) })}/></label>
      <label>{text("after")}<input type="number" min="0" value={config.bufferAfterMinutes} onChange={(e) => setConfig({ ...config, bufferAfterMinutes:Number(e.target.value) })}/></label>
      <label>{text("zone")}<input value={config.timeZone} onChange={(e) => setConfig({ ...config, timeZone:e.target.value })}/></label>
      <label>{text("expiry")}<input type="datetime-local" value={config.expiresAtUtc?.slice(0,16) ?? ""} onChange={(e) => setConfig({ ...config, expiresAtUtc:e.target.value ? new Date(e.target.value).toISOString() : undefined })}/></label>
    </div>
    <div className="booking-subheading"><strong>{text("weekdays")}</strong><button type="button" className="button secondary" onClick={() => setConfig({ ...config, windows:[...config.windows,{ weekday:1,startLocal:"09:00",endLocal:"17:00" }] })}>{text("addWindow")}</button></div>
    {config.windows.map((item,index) => <div className="booking-window" key={`${index}-${item.weekday}`}>
      <select aria-label={text("weekdays")} value={item.weekday} onChange={(e) => updateWindow(index,{ weekday:Number(e.target.value) })}>{days.map((day) => <option key={day} value={day}>{weekday(locale,day)}</option>)}</select>
      <label>{text("start")}<input type="time" value={item.startLocal} onChange={(e) => updateWindow(index,{ startLocal:e.target.value })}/></label>
      <label>{text("end")}<input type="time" value={item.endLocal} onChange={(e) => updateWindow(index,{ endLocal:e.target.value })}/></label>
      <button className="button danger-ghost" onClick={() => setConfig({ ...config, windows:config.windows.filter((_,i) => i !== index) })}>{text("remove")}</button>
    </div>)}
    <button className="button primary" disabled={busy} onClick={() => void save()}>{text("save")}</button>
    {shareUrl && <div className="booking-share"><label>{text("link")}<input readOnly value={shareUrl}/></label><button className="button secondary" onClick={() => void navigator.clipboard?.writeText(shareUrl).then(() => setStatus(text("copied"))).catch(() => setError(text("failed")))}>{text("copy")}</button></div>}
    <h3>{text("pending")} ({requests.length})</h3>
    {!requests.length && <p className="muted">{text("empty")}</p>}
    {requests.map((request) => <article className="booking-request" key={request.id}><div><strong>{request.requesterName}</strong><span>{request.requesterEmail}</span><time>{slotTime(request.requestedStartUtc,locale,config.timeZone)} · {request.durationMinutes} min</time>{request.requesterNote && <p>{request.requesterNote}</p>}</div><div className="booking-request-actions"><button disabled={busy} className="button primary" onClick={() => void decide(request,"approved")}>{text("approve")}</button><button disabled={busy} className="button danger-ghost" onClick={() => void decide(request,"rejected")}>{text("reject")}</button></div></article>)}
  </section></div>;
}

async function databasePreference(bookingLinkId?: string): Promise<void> {
  if (!bookingLinkId) return;
  const { database } = await import("../data/database");
  await database.preferences.update("main", { bookingLinkId });
}

export function PublicBookingPage({ linkId }: { linkId: string }) {
  const [locale,setLocale] = useState<Locale>(() => navigator.language.toLowerCase().startsWith("ar") ? "ar" : "en");
  const text = (key: keyof Words) => w(locale,key);
  const [day,setDay] = useState(""); const [availability,setAvailability] = useState<{ timeZone:string; availableSlots:PublicSlot[] } | null>(null);
  const [slotKey,setSlotKey] = useState(""); const [name,setName] = useState(""); const [email,setEmail] = useState(""); const [note,setNote] = useState("");
  const [message,setMessage] = useState(""); const [error,setError] = useState(""); const [submitted,setSubmitted] = useState(false);
  useEffect(() => { let active=true; void getPublicAvailability(linkId,new Date(Date.now()-86_400_000).toISOString(),new Date(Date.now()+31*86_400_000).toISOString()).then((result) => {
    if (!active) return; setAvailability(result); setDay(currentDay(result.timeZone));
  }).catch(() => { if (active) setError(text("loadSlots")); }); return () => { active=false; }; },[linkId]);
  const slots = useMemo(() => availability?.availableSlots.filter((item) => Temporal.Instant.from(item.startUtc).toZonedDateTimeISO(availability.timeZone).toPlainDate().toString() === day) ?? [],[availability,day]);
  const selected = slots.find((item) => `${item.startUtc}/${item.endUtc}` === slotKey);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return; setError("");
    try { await submitPublicBookingRequest(linkId,{ requesterName:name,requesterEmail:email,requesterNote:note || undefined,requestedStartUtc:selected.startUtc,requestedEndUtc:selected.endUtc,durationMinutes:selected.durationMinutes }); setSubmitted(true); setMessage(text("pendingAck")); }
    catch { setError(text("requestError")); }
  };
  const dayChanged = async (value:string) => {
    setDay(value);setSlotKey(""); if (!availability) return;
    try {
      const date=Temporal.PlainDate.from(value); const start=date.toZonedDateTime({timeZone:availability.timeZone,plainTime:"00:00"}).toInstant();
      const end=date.add({days:1}).toZonedDateTime({timeZone:availability.timeZone,plainTime:"00:00"}).toInstant();
      setAvailability(await getPublicAvailability(linkId,start.toString({fractionalSecondDigits:3}),end.toString({fractionalSecondDigits:3})));
    } catch { setError(text("loadSlots")); }
  };
  return <main className="booking-public-shell" dir={locale === "ar" ? "rtl" : "ltr"}><section className="booking-public panel">
    <header className="dialog-heading"><div><span className="brand-mark">LX</span><h1>{text("publicTitle")}</h1><p className="muted">{text("publicIntro")}</p></div><div className="language-switch" aria-label={text("language")}><button aria-pressed={locale==="en"} onClick={()=>setLocale("en")}>EN</button><button aria-pressed={locale==="ar"} onClick={()=>setLocale("ar")}>ع</button></div></header>
    {error && <p role="alert" className="booking-error">{error}</p>}{message && <p role="status" className="booking-success">{message}</p>}
    {!submitted && availability && <form onSubmit={(event)=>void submit(event)}>
      <label>{text("day")}<input type="date" min={currentDay(availability.timeZone)} value={day} onChange={(event)=>void dayChanged(event.target.value)} required/></label>
      <label>{text("time")}<select value={slotKey} onChange={(event)=>setSlotKey(event.target.value)} required><option value=""></option>{slots.map((slot)=><option key={`${slot.startUtc}/${slot.durationMinutes}`} value={`${slot.startUtc}/${slot.endUtc}`}>{slotTime(slot.startUtc,locale,availability.timeZone)} ({slot.durationMinutes} min){Intl.DateTimeFormat().resolvedOptions().timeZone!==availability.timeZone ? ` · ${slotTime(slot.startUtc,locale,Intl.DateTimeFormat().resolvedOptions().timeZone)} (${Intl.DateTimeFormat().resolvedOptions().timeZone})` : ""}</option>)}</select></label>
      {selected && <p className="booking-slot-duration">{text("duration")}: {selected.durationMinutes} min</p>}{!slots.length && <p className="muted">{text("noSlots")}</p>}
      <label>{text("fullName")}<input autoComplete="name" maxLength={200} required value={name} onChange={(event)=>setName(event.target.value)}/></label>
      <label>{text("email")}<input type="email" autoComplete="email" maxLength={320} required value={email} onChange={(event)=>setEmail(event.target.value)}/></label>
      <label>{text("optionalNote")}<textarea maxLength={2000} value={note} onChange={(event)=>setNote(event.target.value)}/></label>
      <button className="button primary" type="submit" disabled={!selected}>{text("send")}</button>
    </form>}
    <p className="booking-privacy">{text("private")}</p>
  </section></main>;
}
