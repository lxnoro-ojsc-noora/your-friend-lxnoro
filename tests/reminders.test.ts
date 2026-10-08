import { describe, expect, it } from "vitest";
import { dueActivities } from "../src/domain/reminders";
import type { ReminderLedgerEntry, ScheduledActivity } from "../src/domain/model";

const scheduled = (overrides: Partial<ScheduledActivity> = {}): ScheduledActivity => ({
  id: "task-1", typeId: "work", title: "Prepare notes", symbol: "📚", startLocal: "2026-10-08T08:15",
  timeZone: "Asia/Yerevan", durationMinutes: 30, status: "scheduled", notes: "Full private note", alertEnabled: true,
  createdAt: "2026-10-01T00:00:00.000Z", ...overrides,
});

describe("local reminder due calculation", () => {
  it("returns scheduled alert-enabled activities once their local time is due", () => {
    const now = new Date(2026, 9, 8, 8, 30);
    expect(dueActivities([scheduled()], [], now).map(({ id }) => id)).toEqual(["task-1"]);
  });

  it("does not present future, completed, or alert-disabled activities", () => {
    const now = new Date(2026, 9, 8, 8, 30);
    expect(dueActivities([
      scheduled({ id: "future", startLocal: "2026-10-08T09:00" }),
      scheduled({ id: "complete", status: "complete" }),
      scheduled({ id: "muted", alertEnabled: false }),
    ], [], now)).toEqual([]);
  });

  it("uses the local ledger to prevent repeat presentation after dismissal or reload", () => {
    const ledger: ReminderLedgerEntry[] = [{ activityId: "task-1", dueAt: "2026-10-08T08:15", presentedAt: "2026-10-08T08:15:00.000Z" }];
    expect(dueActivities([scheduled()], ledger, new Date(2026, 9, 8, 8, 30))).toEqual([]);
  });

  it("keeps overdue tasks eligible for one catch-up when the app resumes", () => {
    expect(dueActivities([scheduled()], [], new Date(2026, 9, 8, 12, 0))).toHaveLength(1);
  });
});
