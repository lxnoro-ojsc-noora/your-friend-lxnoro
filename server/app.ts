import Fastify, { type FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openBookingDatabase } from "./db/schema";

export function createServer(db: Database.Database): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ status: "ok" }));
  app.addHook("onClose", async () => { db.close(); });
  return app;
}

async function startLocalServer(): Promise<void> {
  const filename = resolve(process.env.LXNORO_BOOKING_DB ?? ".data/booking.sqlite");
  mkdirSync(dirname(filename), { recursive: true });
  const db = openBookingDatabase(filename);
  const app = createServer(db);
  const port = Number(process.env.PORT ?? 3001);
  await app.listen({ host: "127.0.0.1", port });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void startLocalServer();
}
