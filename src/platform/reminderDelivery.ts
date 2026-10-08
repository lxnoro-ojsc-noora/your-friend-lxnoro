import type { ScheduledActivity } from "../domain/model";

export type NotificationPermissionState = NotificationPermission | "unsupported";

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!("Notification" in window)) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export async function deliverReminder(activity: ScheduledActivity): Promise<void> {
  const body = activity.notes.trim()
    ? `${activity.notes.trim()}\n\n${activity.startLocal.slice(0, 10)} · ${activity.startLocal.slice(11, 16)}`
    : `${activity.startLocal.slice(0, 10)} · ${activity.startLocal.slice(11, 16)}`;

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const notification = new Notification(`${activity.symbol} ${activity.title}`, { body, tag: `lxnoro-${activity.id}` });
      notification.onclick = () => { window.focus(); notification.close(); };
    } catch { /* In-app reminder remains available. */ }
  }

  try {
    if ("vibrate" in navigator) navigator.vibrate([120, 50, 120]);
  } catch { /* Haptics are optional and device dependent. */ }

  try {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    if (context.state === "suspended") await context.resume();
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
  } catch { /* Autoplay restrictions and missing audio hardware are expected. */ }
}
