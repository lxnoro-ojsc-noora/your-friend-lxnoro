import Database from "better-sqlite3";

/** Create the privacy-minimal booking projection table if it does not exist. */
export function initializeBookingSchema(db: Database.Database): void {
  db.pragma("foreign_keys = ON");
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

    CREATE TABLE IF NOT EXISTS booking_links (
      link_id_hash TEXT PRIMARY KEY NOT NULL CHECK (length(link_id_hash) = 64),
      owner_id TEXT NOT NULL,
      enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
      expires_at_utc TEXT CHECK (expires_at_utc IS NULL OR substr(expires_at_utc, -1, 1) = 'Z'),
      created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1, 1) = 'Z'),
      updated_at_utc TEXT NOT NULL CHECK (substr(updated_at_utc, -1, 1) = 'Z')
    ) STRICT;
    CREATE INDEX IF NOT EXISTS booking_links_owner ON booking_links(owner_id);

    CREATE TABLE IF NOT EXISTS booking_availability (
      link_id_hash TEXT PRIMARY KEY NOT NULL REFERENCES booking_links(link_id_hash) ON DELETE CASCADE,
      minimum_notice_minutes INTEGER NOT NULL CHECK (minimum_notice_minutes >= 0),
      maximum_advance_minutes INTEGER CHECK (maximum_advance_minutes IS NULL OR maximum_advance_minutes > 0),
      buffer_before_minutes INTEGER NOT NULL CHECK (buffer_before_minutes >= 0),
      buffer_after_minutes INTEGER NOT NULL CHECK (buffer_after_minutes >= 0),
      time_zone TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS booking_allowed_durations (
      link_id_hash TEXT NOT NULL REFERENCES booking_links(link_id_hash) ON DELETE CASCADE,
      duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
      PRIMARY KEY (link_id_hash, duration_minutes)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS booking_availability_windows (
      link_id_hash TEXT NOT NULL REFERENCES booking_links(link_id_hash) ON DELETE CASCADE,
      weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
      start_local TEXT NOT NULL CHECK (length(start_local) = 5),
      end_local TEXT NOT NULL CHECK (length(end_local) = 5),
      PRIMARY KEY (link_id_hash, weekday, start_local, end_local),
      CHECK (start_local < end_local)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS booking_requests (
      request_id TEXT PRIMARY KEY NOT NULL,
      link_id_hash TEXT NOT NULL REFERENCES booking_links(link_id_hash),
      owner_id TEXT NOT NULL,
      requester_name TEXT NOT NULL CHECK (length(trim(requester_name)) > 0),
      requester_email TEXT NOT NULL,
      requester_note TEXT,
      requested_start_utc TEXT NOT NULL CHECK (substr(requested_start_utc, -1, 1) = 'Z'),
      requested_end_utc TEXT NOT NULL CHECK (substr(requested_end_utc, -1, 1) = 'Z'),
      duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1, 1) = 'Z'),
      updated_at_utc TEXT NOT NULL CHECK (substr(updated_at_utc, -1, 1) = 'Z'),
      CHECK (requested_start_utc < requested_end_utc)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS booking_requests_owner_status_time
      ON booking_requests(owner_id, status, requested_start_utc);

    CREATE TABLE IF NOT EXISTS confirmed_appointments (
      appointment_id TEXT PRIMARY KEY NOT NULL,
      request_id TEXT NOT NULL UNIQUE REFERENCES booking_requests(request_id),
      owner_id TEXT NOT NULL,
      start_utc TEXT NOT NULL CHECK (substr(start_utc, -1, 1) = 'Z'),
      end_utc TEXT NOT NULL CHECK (substr(end_utc, -1, 1) = 'Z'),
      duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
      time_zone TEXT NOT NULL,
      created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1, 1) = 'Z'),
      CHECK (start_utc < end_utc)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS confirmed_appointments_owner_time
      ON confirmed_appointments(owner_id, start_utc, end_utc);

    CREATE TABLE IF NOT EXISTS booking_email_deliveries (
      delivery_id TEXT PRIMARY KEY NOT NULL,
      request_id TEXT NOT NULL UNIQUE REFERENCES booking_requests(request_id),
      status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at_utc TEXT NOT NULL CHECK (substr(next_attempt_at_utc, -1, 1) = 'Z'),
      lease_token TEXT,
      lease_until_utc TEXT CHECK (lease_until_utc IS NULL OR substr(lease_until_utc, -1, 1) = 'Z'),
      last_error_code TEXT,
      created_at_utc TEXT NOT NULL CHECK (substr(created_at_utc, -1, 1) = 'Z'),
      updated_at_utc TEXT NOT NULL CHECK (substr(updated_at_utc, -1, 1) = 'Z'),
      sent_at_utc TEXT CHECK (sent_at_utc IS NULL OR substr(sent_at_utc, -1, 1) = 'Z')
    ) STRICT;
    CREATE INDEX IF NOT EXISTS booking_email_due
      ON booking_email_deliveries(status, next_attempt_at_utc, lease_until_utc);
  `);

  const appointmentColumns = db.prepare("PRAGMA table_info(confirmed_appointments)").all() as Array<{ name: string }>;
  if (!appointmentColumns.some(({ name }) => name === "time_zone")) {
    db.exec("ALTER TABLE confirmed_appointments ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'UTC'");
    db.exec(`
      UPDATE confirmed_appointments
      SET time_zone = (
        SELECT availability.time_zone
        FROM booking_requests AS request
        JOIN booking_availability AS availability ON availability.link_id_hash = request.link_id_hash
        WHERE request.request_id = confirmed_appointments.request_id
      )
    `);
  }
}

export function openBookingDatabase(filename: string): Database.Database {
  const db = new Database(filename);
  initializeBookingSchema(db);
  return db;
}
