import Database from "better-sqlite3";

/** Create the privacy-minimal booking projection table if it does not exist. */
export function initializeBookingSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS busy_intervals (
      owner_id TEXT NOT NULL,
      start_utc TEXT NOT NULL CHECK (substr(start_utc, -1, 1) = 'Z'),
      end_utc TEXT NOT NULL CHECK (substr(end_utc, -1, 1) = 'Z'),
      source_revision INTEGER NOT NULL CHECK (source_revision > 0),
      updated_at TEXT NOT NULL CHECK (substr(updated_at, -1, 1) = 'Z'),
      PRIMARY KEY (owner_id, start_utc, end_utc),
      CHECK (start_utc < end_utc)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS booking_projection_state (
      owner_id TEXT PRIMARY KEY NOT NULL,
      source_revision INTEGER NOT NULL CHECK (source_revision > 0),
      updated_at TEXT NOT NULL CHECK (substr(updated_at, -1, 1) = 'Z')
    ) STRICT;
  `);
}

export function openBookingDatabase(filename: string): Database.Database {
  const db = new Database(filename);
  initializeBookingSchema(db);
  return db;
}
