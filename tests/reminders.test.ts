import { describe, expect, it } from "vitest";
import { dueActivities } from "../src/domain/reminders";
import { localDateTime } from "../src/domain/time";
import type { ReminderLedgerEntry, ScheduledActivity } from "../src/domain/model";

const scheduled = (overrides: Partial<ScheduledActivity> = {}): ScheduledActivity => ({
  id: "task-1", typeId: "work", title: "Prepare notes", symbol: "📚", startLocal: "2026-10-08T08:15",
  timeZone: "Asia/Yerevan", durationMinutes: 30, status: "scheduled", notes: "Full private note", alertEnabled: true,
  createdAt: "2026-10-01T00:00:00.000Z", ...overrides,
});

describe("local reminder due calculation", () => {
  it("returns scheduled alert-enabled activities once their local time is due", () => {
    const now = localDateTime("2026-10-08", "08:30", "Asia/Yerevan");
    expect(dueActivities([scheduled()], [], now).map(({ id }) => id)).toEqual(["task-1"]);
  });

  it("does not present future, completed, or alert-disabled activities", () => {
    const now = localDateTime("2026-10-08", "08:30", "Asia/Yerevan");
    expect(dueActivities([
      scheduled({ id: "future", startLocal: "2026-10-08T09:00" }),
      scheduled({ id: "complete", status: "complete" }),
      scheduled({ id: "muted", alertEnabled: false }),
    ], [], now)).toEqual([]);
  });

  it("uses the local ledger to prevent repeat presentation after dismissal or reload", () => {
    const ledger: ReminderLedgerEntry[] = [{ activityId: "task-1", dueAt: "2026-10-08T08:15", presentedAt: "2026-10-08T08:15:00.000Z" }];
    expect(dueActivities([scheduled()], ledger, localDateTime("2026-10-08", "08:30", "Asia/Yerevan"))).toEqual([]);
  });

  it("keeps overdue tasks eligible for one catch-up when the app resumes", () => {
    expect(dueActivities([scheduled()], [], localDateTime("2026-10-08", "12:00", "Asia/Yerevan"))).toHaveLength(1);
  });

  it("orders reminders from different zones by their actual instants", () => {
    const tokyo = scheduled({ id: "tokyo", startLocal: "2026-10-08T09:00", timeZone: "Asia/Tokyo" });
    const losAngeles = scheduled({ id: "los-angeles", startLocal: "2026-10-08T09:00", timeZone: "America/Los_Angeles" });
    const due = dueActivities([losAngeles, tokyo], [], localDateTime("2026-10-08", "18:00", "UTC"));
    expect(due.map(({ id }) => id)).toEqual(["tokyo", "los-angeles"]);
  });
});
