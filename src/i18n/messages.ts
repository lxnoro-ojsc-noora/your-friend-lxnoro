import type { Locale } from "../domain/model";

const messages = {
  en: {
    product: "Your friend LXNORO", companion: "Your personal time engine", loading: "Opening your time space…",
    now: "Now", live: "LIVE", next: "Next", nothingNext: "Nothing scheduled next", today: "Today", day: "Day", week: "Week", month: "Month", year: "Year", fiveYears: "5 years",
    currentDay: "Current day", time: "Time", activity: "Activity", timeMatrix: "Time matrix", timeStructure: "Your time structure", planningHorizons: "Planning horizons", readyToShape: "A foundation, not a schedule", yourTime: "Your timeline",
    midnight: "00:00 · start", nextMidnight: "24:00 · next day", locationNotSet: "City not set", weatherLater: "Weather stays off until you choose to enable it and grant location access.", dismiss: "Dismiss", emptyGrid: "Your activities will appear here when you schedule them.",
    starterHeading: "Starter activities", starterDescription: "Editable foundations · not scheduled yet", schedule: "Schedule", edit: "Edit", remove: "Remove", addActivity: "Add activity", addFirst: "Create your first activity", customActivity: "Create custom activity", activityName: "Activity name", symbol: "Emoji or symbol", date: "Date", startTime: "Start time", duration: "Duration (minutes)", save: "Save", cancel: "Cancel", editStarter: "Edit starter activity", scheduleActivity: "Schedule activity", editScheduled: "Edit scheduled activity", saved: "Saved on this device", location: "Location", addLocation: "Add country and city", country: "Country", city: "City", language: "Language", english: "English", arabic: "العربية", settings: "Preferences", activityRemoved: "Activity removed", removeConfirm: "Remove this starter activity? Scheduled items are kept.", storageError: "LX NORO could not save this change. Check browser storage and try again.", emptyHorizon: "No activities are scheduled in this horizon yet.", horizonIntro: "Move from today's details to a wider view of your plans.", selectDate: "Selected date",
    starterBreakfast: "Breakfast", starterCoffee: "Coffee / morning routine", starterSleep: "Sleep", starterShower: "Shower", starterMeals: "Meals", starterMedication: "Medication", starterStudy: "Study", starterWork: "Work", starterExercise: "Exercise", starterCleaning: "Cleaning", starterShopping: "Shopping", starterTravel: "Travel", starterHome: "Home time", starterFamily: "Family time", starterAppointments: "Appointments", starterRest: "Rest", custom: "Custom", scheduled: "Scheduled",
  },
  ar: {
    product: "صديقك LXNORO", companion: "محركك الشخصي للوقت", loading: "جارٍ فتح مساحة وقتك…",
    now: "الآن", live: "مباشر", next: "التالي", nothingNext: "لا يوجد نشاط مجدول تالٍ", today: "اليوم", day: "اليوم", week: "الأسبوع", month: "الشهر", year: "السنة", fiveYears: "٥ سنوات",
    currentDay: "اليوم الحالي", time: "الوقت", activity: "النشاط", timeMatrix: "مصفوفة الوقت", timeStructure: "هيكل وقتك", planningHorizons: "آفاق التخطيط", readyToShape: "أساس قابل للتعديل، وليس جدولاً", yourTime: "خطك الزمني",
    midnight: "٠٠:٠٠ · البداية", nextMidnight: "٢٤:٠٠ · اليوم التالي", locationNotSet: "لم تُحدد المدينة", weatherLater: "لن يُفعّل الطقس حتى تختار ذلك وتمنح إذن الموقع.", dismiss: "إخفاء", emptyGrid: "ستظهر أنشطتك هنا عند جدولتها.",
    starterHeading: "أنشطة البداية", starterDescription: "أساسيات قابلة للتخصيص · غير مجدولة بعد", schedule: "جدولة", edit: "تعديل", remove: "إزالة", addActivity: "إضافة نشاط", addFirst: "أنشئ نشاطك الأول", customActivity: "إنشاء نشاط مخصص", activityName: "اسم النشاط", symbol: "رمز أو إيموجي", date: "التاريخ", startTime: "وقت البدء", duration: "المدة (بالدقائق)", save: "حفظ", cancel: "إلغاء", editStarter: "تعديل نشاط البداية", scheduleActivity: "جدولة نشاط", editScheduled: "تعديل نشاط مجدول", saved: "محفوظ على هذا الجهاز", location: "الموقع", addLocation: "إضافة الدولة والمدينة", country: "الدولة", city: "المدينة", language: "اللغة", english: "English", arabic: "العربية", settings: "التفضيلات", activityRemoved: "تمت إزالة النشاط", removeConfirm: "إزالة نشاط البداية؟ ستبقى العناصر المجدولة.", storageError: "تعذر على LXNORO حفظ التغيير. تحقق من مساحة المتصفح وحاول مجدداً.", emptyHorizon: "لا توجد أنشطة مجدولة في هذا الأفق بعد.", horizonIntro: "انتقل من تفاصيل اليوم إلى نظرة أوسع على خططك.", selectDate: "التاريخ المحدد",
    starterBreakfast: "الإفطار", starterCoffee: "القهوة / روتين الصباح", starterSleep: "النوم", starterShower: "الاستحمام", starterMeals: "الوجبات", starterMedication: "الدواء", starterStudy: "الدراسة", starterWork: "العمل", starterExercise: "التمرين", starterCleaning: "التنظيف", starterShopping: "التسوق", starterTravel: "السفر", starterHome: "وقت المنزل", starterFamily: "وقت العائلة", starterAppointments: "المواعيد", starterRest: "الراحة", custom: "مخصص", scheduled: "مجدول",
  },
} as const;

export type MessageKey = keyof typeof messages.en;
export function translate(locale: Locale, key: MessageKey): string { return messages[locale][key]; }
export function formatStarterTitle(locale: Locale, starterKey: string): string {
  const key = `starter${starterKey.charAt(0).toUpperCase()}${starterKey.slice(1)}` as MessageKey;
  return translate(locale, key);
}
export function formatDate(date: Date, locale: Locale, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { weekday: "long", month: "long", day: "numeric", year: "numeric", ...options }).format(date);
}
export function formatTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { hour: "numeric", minute: "2-digit" }).format(date);
}
