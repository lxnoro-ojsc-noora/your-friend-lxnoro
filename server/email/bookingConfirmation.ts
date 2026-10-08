import Database from "better-sqlite3";
import {
  claimDueBookingEmail,
  getBookingEmailDeliveryState,
  listDueBookingEmailRequestIds,
  markBookingEmailAttemptFailed,
  markBookingEmailSent,
  type BookingEmailDeliveryState,
} from "../db/repositories/bookingEmails";
import type { BookingConfirmationEmail, BookingConfirmationMailer } from "./types";

export interface BookingEmailDispatcherOptions {
  messageIdDomain: string;
  now?: () => Date;
  maxAttempts?: number;
  baseRetryMilliseconds?: number;
  leaseMilliseconds?: number;
}

function confirmationMessage(
  row: NonNullable<ReturnType<typeof claimDueBookingEmail>>,
  messageIdDomain: string,
): BookingConfirmationEmail {
  const cleanName = row.recipientName.replace(/[\r\n\0-\x1f\x7f]/g, " ").trim();
  const dateTime = new Intl.DateTimeFormat("en", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: row.timeZone,
    timeZoneName: "short",
  }).format(new Date(row.startUtc));
  const text = [
    "Hello " + cleanName + ",",
    "",
    "Your appointment is confirmed.",
    "Date and time: " + dateTime,
    "Duration: " + row.durationMinutes + " minutes",
    "Time zone: " + row.timeZone,
    "",
    "Your friend LXNORO",
  ].join("\n");
  return {
    to: { name: cleanName, email: row.recipientEmail },
    subject: "Your appointment is confirmed",
    text,
    messageId: "<booking-confirmation-" + row.deliveryId + "@" + messageIdDomain + ">",
  };
}

export class BookingEmailDispatcher {
  private readonly now: () => Date;
  private readonly maxAttempts: number;
  private readonly baseRetryMilliseconds: number;
  private readonly leaseMilliseconds: number;
  private timer: ReturnType<typeof setInterval> | undefined;
  private processing: Promise<void> | undefined;

  constructor(
    private readonly db: Database.Database,
    private readonly mailer: BookingConfirmationMailer | undefined,
    private readonly options: BookingEmailDispatcherOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseRetryMilliseconds = options.baseRetryMilliseconds ?? 60_000;
    this.leaseMilliseconds = options.leaseMilliseconds ?? 120_000;
  }

  async deliverRequestNow(requestId: string): Promise<BookingEmailDeliveryState | undefined> {
    const claimed = claimDueBookingEmail(this.db, this.now(), this.leaseMilliseconds, requestId);
    if (claimed) await this.sendClaimed(claimed);
    return getBookingEmailDeliveryState(this.db, requestId);
  }

  async processDueBatch(limit = 25): Promise<void> {
    if (this.processing) return this.processing;
    this.processing = (async () => {
      const requests = listDueBookingEmailRequestIds(this.db, this.now(), limit);
      for (const requestId of requests) {
        const claimed = claimDueBookingEmail(this.db, this.now(), this.leaseMilliseconds, requestId);
        if (claimed) await this.sendClaimed(claimed);
      }
    })().finally(() => { this.processing = undefined; });
    return this.processing;
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

  private async sendClaimed(row: NonNullable<ReturnType<typeof claimDueBookingEmail>>): Promise<void> {
    try {
      if (!this.mailer) throw new Error("smtp_not_configured");
      await this.mailer.sendConfirmation(confirmationMessage(row, this.options.messageIdDomain));
      markBookingEmailSent(this.db, row, this.now());
    } catch (error) {
      const errorCode = error instanceof Error && error.message === "smtp_not_configured"
        ? "smtp_not_configured"
        : "smtp_delivery_failed";
      const retryAt = row.attemptCount < this.maxAttempts
        ? new Date(this.now().getTime() + Math.min(this.baseRetryMilliseconds * (2 ** (row.attemptCount - 1)), 6 * 60 * 60_000))
        : undefined;
      markBookingEmailAttemptFailed(this.db, row, this.now(), errorCode, retryAt);
    }
  }
}
