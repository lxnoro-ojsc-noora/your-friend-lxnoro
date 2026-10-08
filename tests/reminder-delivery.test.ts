import { afterEach, describe, expect, it, vi } from "vitest";
import { deliverReminder } from "../src/platform/reminderDelivery";
import type { ScheduledActivity } from "../src/domain/model";

class NotificationMock {
  static permission: NotificationPermission = "granted";
  static sent: Array<{ title: string; body: string }> = [];
  onclick: ((event: Event) => void) | null = null;
  constructor(title: string, options?: NotificationOptions) {
    NotificationMock.sent.push({ title, body: options?.body ?? "" });
  }
  close() {}
}

const activity: ScheduledActivity = {
  id: "task-1", typeId: "study", title: "Study", symbol: "📚", startLocal: "2026-10-08T08:15",
  timeZone: "Asia/Yerevan", durationMinutes: 30, status: "scheduled", notes: "Bring the complete research notes.",
  alertEnabled: true, createdAt: "2026-10-01T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
  NotificationMock.sent = [];
});

describe("reminder delivery adapters", () => {
  it("includes the complete saved note in browser notification content", async () => {
    vi.stubGlobal("window", { Notification: NotificationMock, focus: vi.fn() });
    vi.stubGlobal("Notification", NotificationMock);
    vi.stubGlobal("navigator", { vibrate: vi.fn() });
    await deliverReminder(activity);
    expect(NotificationMock.sent).toHaveLength(1);
    expect(NotificationMock.sent[0]?.title).toContain("Study");
    expect(NotificationMock.sent[0]?.body).toContain(activity.notes);
  });

  it("keeps local reminder presentation safe when optional delivery APIs are absent", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    await expect(deliverReminder(activity)).resolves.toBeUndefined();
  });
});
