import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openBookingDatabase } from "./db/schema";
import { registerOwnerRoutes } from "./routes/owner";
import { registerBookingRoutes } from "./routes/booking";
import { BookingEmailDispatcher } from "./email/bookingConfirmation";
import { createConfiguredBookingMailer } from "./email/smtp";
import type { BookingConfirmationMailer } from "./email/types";
import { registerWeatherRoutes } from "./routes/weather";
import type { WeatherProviderOptions } from "./weather/metNorway";

export interface ServerOptions {
  developmentAuth?: boolean;
  bookingNow?: () => Date;
  bookingConfirmationMailer?: BookingConfirmationMailer;
  startBookingEmailWorker?: boolean;
  weather?: WeatherProviderOptions;
}

export function createServer(db: Database.Database, options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  const configuredMailer = createConfiguredBookingMailer();
  const emailDispatcher = new BookingEmailDispatcher(
    db,
    options.bookingConfirmationMailer ?? configuredMailer.mailer,
    { messageIdDomain: configuredMailer.messageIdDomain, now: options.bookingNow },
  );
  app.get("/health", async () => ({ status: "ok" }));
  registerOwnerRoutes(app, db, { developmentAuth: options.developmentAuth ?? false });
  registerBookingRoutes(app, db, {
    developmentAuth: options.developmentAuth ?? false,
    now: options.bookingNow,
    emailDispatcher,
  });
  registerWeatherRoutes(app, options.weather);
  if (options.startBookingEmailWorker) {
    app.addHook("onReady", async () => { emailDispatcher.start(); });
    app.addHook("onClose", async () => { emailDispatcher.stop(); });
  }
  app.addHook("onClose", async () => { db.close(); });
  return app;
}

async function startLocalServer(): Promise<void> {
  const filename = resolve(process.env.LXNORO_BOOKING_DB ?? ".data/booking.sqlite");
  mkdirSync(dirname(filename), { recursive: true });
  const db = openBookingDatabase(filename);
  const app = createServer(db, { developmentAuth: process.env.NODE_ENV !== "production", startBookingEmailWorker: true });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ host: "127.0.0.1", port });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void startLocalServer();
}
