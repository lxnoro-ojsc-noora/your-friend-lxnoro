import nodemailer from "nodemailer";
import type { BookingConfirmationMailer } from "./types";

export interface SmtpEnvironment {
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_SECURE?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
  SMTP_MESSAGE_ID_DOMAIN?: string;
}

export interface SmtpConfiguration {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  messageIdDomain: string;
}

export function smtpConfigurationFromEnvironment(environment: SmtpEnvironment): SmtpConfiguration | undefined {
  const host = environment.SMTP_HOST?.trim();
  const from = environment.SMTP_FROM?.trim();
  if (!host || !from) return undefined;
  const port = environment.SMTP_PORT === undefined ? 587 : Number(environment.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return undefined;
  const user = environment.SMTP_USER?.trim();
  const pass = environment.SMTP_PASS;
  if ((user && !pass) || (!user && pass)) return undefined;
  if (!/^[^@\s]+@[^@\s]+$/.test(from)) return undefined;
  const messageIdDomain = environment.SMTP_MESSAGE_ID_DOMAIN?.trim() || from.split("@")[1] || "localhost";
  if (!/^[A-Za-z0-9.-]+$/.test(messageIdDomain)) return undefined;
  return {
    host,
    port,
    secure: environment.SMTP_SECURE === "true" || (environment.SMTP_SECURE !== "false" && port === 465),
    ...(user ? { user } : {}),
    ...(pass ? { pass } : {}),
    from,
    messageIdDomain,
  };
}

/** SMTP transport adapter; secrets are supplied only through runtime environment configuration. */
export function createSmtpBookingConfirmationMailer(
  configuration: SmtpConfiguration,
): BookingConfirmationMailer {
  const transport = nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.secure,
    ...(configuration.user && configuration.pass
      ? { auth: { user: configuration.user, pass: configuration.pass } }
      : {}),
  });
  return {
    async sendConfirmation(email) {
      await transport.sendMail({
        from: configuration.from,
        to: { name: email.to.name, address: email.to.email },
        subject: email.subject,
        text: email.text,
        messageId: email.messageId,
      });
    },
  };
}

export function createConfiguredBookingMailer(environment: SmtpEnvironment = process.env): {
  mailer?: BookingConfirmationMailer;
  messageIdDomain: string;
} {
  const configuration = smtpConfigurationFromEnvironment(environment);
  return {
    ...(configuration ? { mailer: createSmtpBookingConfirmationMailer(configuration) } : {}),
    messageIdDomain: configuration?.messageIdDomain ?? "localhost",
  };
}
