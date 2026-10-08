import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "../server/app";
import { initializeBookingSchema } from "../server/db/schema";

const databases: Database.Database[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) if (db.open) db.close();
});

function memoryDatabase(): Database.Database {
  const db = new Database(":memory:");
  databases.push(db);
  return db;
}

describe("booking server foundation", () => {
  it("initializes only the required privacy-minimal busy interval columns", () => {
    const db = memoryDatabase();
    initializeBookingSchema(db);
    initializeBookingSchema(db);

    const columns = db.prepare("PRAGMA table_info(busy_intervals)").all() as Array<{ name: string }>;
    expect(columns.map(({ name }) => name)).toEqual([
      "owner_id", "start_utc", "end_utc", "source_revision", "updated_at",
    ]);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'busy_intervals'").get()).toBeDefined();
  });

  it("accepts valid UTC intervals and rejects invalid revision or interval data", () => {
    const db = memoryDatabase();
    initializeBookingSchema(db);
    const insert = db.prepare(`
      INSERT INTO busy_intervals (owner_id, start_utc, end_utc, source_revision, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    expect(() => insert.run("owner-1", "2026-10-08T08:00:00.000Z", "2026-10-08T09:00:00.000Z", 1, "2026-10-08T00:00:00.000Z")).not.toThrow();
    expect(() => insert.run("owner-1", "2026-10-08T08:00:00", "2026-10-08T09:00:00.000Z", 2, "2026-10-08T00:00:00.000Z")).toThrow();
    expect(() => insert.run("owner-1", "2026-10-08T09:00:00.000Z", "2026-10-08T08:00:00.000Z", 2, "2026-10-08T00:00:00.000Z")).toThrow();
    expect(() => insert.run("owner-1", "2026-10-08T08:00:00.000Z", "2026-10-08T09:00:00.000Z", 0, "2026-10-08T00:00:00.000Z")).toThrow();
  });

  it("exposes a minimal local health endpoint", async () => {
    const app = createServer(memoryDatabase());
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
    await app.close();
  });
});
