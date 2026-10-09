import Database from "better-sqlite3";
import {
  claimDueBookingReminderJob,
  completeClaimedBookingReminderJob,
  releaseClaimedBookingReminderJob,
  recoverExpiredBookingReminderLeases,
  reconcileBookingReminderJobs,
} from "../db/repositories/bookingReminders";
import type { BookingConfirmationMailer } from "./types";

export class BookingReminderDispatcher {
  private timer: ReturnType<typeof setInterval> | undefined;
  private running = false;

  constructor(
    private readonly db: Database.Database,
    private readonly mailer: BookingConfirmationMailer | undefined,
    private readonly messageIdDomain: string,
    private readonly ownerEmail = process.env.OWNER_NOTIFICATION_EMAIL,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async processDueBatch(limit = 25): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = this.now();
      recoverExpiredBookingReminderLeases(this.db, now);
      reconcileBookingReminderJobs(this.db, now);

      for (let i = 0; i < limit; i++) {
        const job = claimDueBookingReminderJob(this.db, this.now());
        if (!job) break;
        try {
          if (!this.mailer || !this.ownerEmail) throw new Error("reminder_email_not_configured");
          const start = new Intl.DateTimeFormat("en", {
            dateStyle: "full", timeStyle: "short", timeZone: job.ownerTimeZone,
          }).format(new Date(job.requestedStartUtc));
          await this.mailer.sendConfirmation({
            to: { name: "Your friend LXNORO", email: this.ownerEmail },
            subject: "Pending booking request reminder",
            text: `A booking request is still pending.\nRequested time: ${start}\nTime zone: ${job.ownerTimeZone}\nReminder: ${job.cadence}`,
            messageId: `<${job.idempotencyKey.replace(/[^A-Za-z0-9_.-]/g, "-")}@${this.messageIdDomain}>`,
          });
          completeClaimedBookingReminderJob(this.db, job.reminderId, job.leaseToken, this.now());
        } catch {
          const retry = new Date(this.now().getTime() + 60_000);
          releaseClaimedBookingReminderJob(this.db, job.reminderId, job.leaseToken, retry);
        }
      }
    } finally {
      this.running = false;
    }
  }

  start(intervalMilliseconds = 30_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.processDueBatch(); }, intervalMilliseconds);
    this.timer.unref?.();
    void this.processDueBatch();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
