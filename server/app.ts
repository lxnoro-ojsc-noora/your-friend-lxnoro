import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openBookingDatabase } from "./db/schema";
import { registerOwnerRoutes } from "./routes/owner";

export interface ServerOptions {
  developmentAuth?: boolean;
}

export function createServer(db: Database.Database, options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok" }));
  registerOwnerRoutes(app, db, { developmentAuth: options.developmentAuth ?? false });
  app.addHook("onClose", async () => { db.close(); });
  return app;
}

async function startLocalServer(): Promise<void> {
  const filename = resolve(process.env.LXNORO_BOOKING_DB ?? ".data/booking.sqlite");
  mkdirSync(dirname(filename), { recursive: true });
  const db = openBookingDatabase(filename);
  const app = createServer(db, { developmentAuth: process.env.NODE_ENV !== "production" });
  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ host: "127.0.0.1", port });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void startLocalServer();
}
