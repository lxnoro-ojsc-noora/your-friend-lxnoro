import type { ScheduledActivity } from "../domain/model";

export type NotificationPermissionState = NotificationPermission | "unsupported";

let audioUnlocked = false;

export function initAudioOnUserGesture(): void {
  if (audioUnlocked || typeof window === "undefined") return;
  const unlock = async () => {
    try {
      const AudioContextConstructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const ctx = new AudioContextConstructor();
      if (ctx.state === "suspended") await ctx.resume();
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      audioUnlocked = true;
      console.info("[ReminderDelivery] Audio unlocked successfully via user gesture.");
      ["click", "keydown", "touchstart", "pointerdown"].forEach((ev) => window.removeEventListener(ev, unlock));
    } catch (err) {
      console.warn("[ReminderDelivery] Audio unlock attempt failed:", err);
    }
  };
  ["click", "keydown", "touchstart", "pointerdown"].forEach((ev) => window.addEventListener(ev, unlock, { once: true }));
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!("Notification" in window)) {
    console.warn("[ReminderDelivery] Notifications unsupported in this browser environment.");
    return "unsupported";
  }
  try {
    const permission = await Notification.requestPermission();
    console.info("[ReminderDelivery] Notification permission result:", permission);
    return permission;
  } catch (err) {
    console.error("[ReminderDelivery] Notification permission request error:", err);
    return "denied";
  }
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerPushSubscription(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const res = await fetch("/api/push/vapid-key");
    if (!res.ok) return;
    const { publicKey } = await res.json() as { publicKey?: string };
    if (!publicKey) return;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        ownerId: "local-owner",
        keys: {
          p256dh: subscription.toJSON().keys?.p256dh ?? "",
          auth: subscription.toJSON().keys?.auth ?? "",
        },
      }),
    });
    console.info("[ReminderDelivery] Push subscription registered successfully.");
  } catch (err) {
    console.warn("[ReminderDelivery] Push subscription registration failed:", err);
  }
}

export async function deliverReminder(activity: ScheduledActivity): Promise<void> {
  const body = activity.notes.trim()
    ? `${activity.notes.trim()}\n\n${activity.startLocal.slice(0, 10)} · ${activity.startLocal.slice(11, 16)}`
    : `${activity.startLocal.slice(0, 10)} · ${activity.startLocal.slice(11, 16)}`;

  console.info("[ReminderDelivery] Starting reminder delivery lifecycle for activity:", {
    id: activity.id,
    title: activity.title,
    startLocal: activity.startLocal,
    timeZone: activity.timeZone,
  });

  // Stage 1: Visible Notification (Main window or Service Worker background push)
  let notificationDelivered = false;
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const notification = new Notification(`${activity.symbol} ${activity.title}`, { body, tag: `lxnoro-${activity.id}` });
      notification.onclick = () => { window.focus(); notification.close(); };
      notificationDelivered = true;
      console.info("[ReminderDelivery] [Stage 1 - Visible Notification] Successfully dispatched main window Notification API.");
    } catch (err) {
      console.warn("[ReminderDelivery] [Stage 1 - Visible Notification] Main window notification threw error:", err);
    }
  } else {
    console.info("[ReminderDelivery] [Stage 1 - Visible Notification] Notification permission not granted:", "Notification" in window ? Notification.permission : "unsupported");
  }

  // Fallback / background dispatch via Service Worker
  if (!notificationDelivered && "navigator" in window && "serviceWorker" in navigator && navigator.serviceWorker.controller) {
    try {
      navigator.serviceWorker.controller.postMessage({ type: "SHOW_REMINDER", activity });
      console.info("[ReminderDelivery] [Stage 1 - Service Worker] Dispatched SHOW_REMINDER message to service worker.");
    } catch (err) {
      console.warn("[ReminderDelivery] [Stage 1 - Service Worker] Failed to post message to service worker:", err);
    }
  }

  // Stage 2: Vibration / Haptics
  try {
    if ("vibrate" in navigator) {
      const vibrated = navigator.vibrate([120, 50, 120]);
      console.info("[ReminderDelivery] [Stage 2 - Vibration] Triggered navigator.vibrate:", vibrated);
    } else {
      console.info("[ReminderDelivery] [Stage 2 - Vibration] Vibration API not supported on this device/platform.");
    }
  } catch (err) {
    console.warn("[ReminderDelivery] [Stage 2 - Vibration] Vibration threw error:", err);
  }

  // Stage 3: Audible Alert (Web Audio API Synthesizer)
  try {
    const AudioContextConstructor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      console.info("[ReminderDelivery] [Stage 3 - Audio] AudioContext unsupported in this environment.");
      return;
    }
    const context = new AudioContextConstructor();
    if (context.state === "suspended") {
      await context.resume();
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.22);
    window.setTimeout(() => void context.close(), 300);
    console.info("[ReminderDelivery] [Stage 3 - Audio] Successfully played audible alert synthesizer tone.");
  } catch (err) {
    console.warn("[ReminderDelivery] [Stage 3 - Audio] Audible alert failed (autoplay restrictions or missing audio device):", err);
  }
}
