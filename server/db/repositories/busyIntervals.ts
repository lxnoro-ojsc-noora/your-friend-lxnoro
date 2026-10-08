import Database from "better-sqlite3";
import { parseBookingProjection, ProjectionInputError } from "../../domain/conflicts";

export class StaleProjectionError extends Error {
  readonly code = "stale_revision";
}

export class BusyIntervalConflictError extends Error {
  readonly code = "overlapping_intervals";
}

export interface ProjectionPublishResult {
  ownerId: string;
  revision: number;
  intervalCount: number;
  updatedAt: string;
}

export interface OwnerBusyIntervalSnapshot {
  ownerId: string;
  revision: number;
  intervals: Array<{ startUtc: string; endUtc: string }>;
  syncStatus: "synced";
  updatedAt: string | null;
}

export function getOwnerBusyIntervalSnapshot(db: Database.Database, ownerId: string): OwnerBusyIntervalSnapshot {
  const state = db.prepare("SELECT source_revision, updated_at FROM booking_projection_state WHERE owner_id = ?").get(ownerId) as
    { source_revision: number; updated_at: string } | undefined;
  const rows = db.prepare(`
    SELECT start_utc, end_utc
    FROM busy_intervals
    WHERE owner_id = ?
    ORDER BY start_utc, end_utc
  `).all(ownerId) as Array<{ start_utc: string; end_utc: string }>;
  return {
    ownerId,
    revision: state?.source_revision ?? 0,
    intervals: rows.map(({ start_utc, end_utc }) => ({ startUtc: start_utc, endUtc: end_utc })),
    syncStatus: "synced",
    updatedAt: state?.updated_at ?? null,
  };
}

export function replaceOwnerBusyIntervals(
  db: Database.Database,
  ownerId: string,
  input: unknown,
): ProjectionPublishResult {
  if (!ownerId || ownerId.length > 128) throw new ProjectionInputError("Owner identity is invalid");
  const projection = parseBookingProjection(input);
  const updatedAt = new Date().toISOString();

  const replace = db.transaction((): ProjectionPublishResult => {
    const state = db.prepare("SELECT source_revision FROM booking_projection_state WHERE owner_id = ?").get(ownerId) as { source_revision: number } | undefined;
    if (state && projection.revision <= state.source_revision) throw new StaleProjectionError("Projection revision must advance");

    const coveredRows = db.prepare(`
      SELECT start_utc, end_utc, source_revision, updated_at
      FROM busy_intervals
      WHERE owner_id = ? AND start_utc < ? AND end_utc > ?
    `).all(ownerId, projection.coverageEndUtc, projection.coverageStartUtc) as Array<{
      start_utc: string; end_utc: string; source_revision: number; updated_at: string;
    }>;
    db.prepare(`
      DELETE FROM busy_intervals
      WHERE owner_id = ? AND start_utc < ? AND end_utc > ?
    `).run(ownerId, projection.coverageEndUtc, projection.coverageStartUtc);

    const preserveOutsideCoverage = db.prepare(`
      INSERT INTO busy_intervals (owner_id, start_utc, end_utc, source_revision, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const row of coveredRows) {
      if (row.start_utc < projection.coverageStartUtc) {
        preserveOutsideCoverage.run(ownerId, row.start_utc, projection.coverageStartUtc, row.source_revision, row.updated_at);
      }
      if (row.end_utc > projection.coverageEndUtc) {
        preserveOutsideCoverage.run(ownerId, projection.coverageEndUtc, row.end_utc, row.source_revision, row.updated_at);
      }
    }
    const conflictQuery = db.prepare(`
      SELECT 1 AS conflict
      FROM busy_intervals
      WHERE owner_id = ? AND start_utc < ? AND end_utc > ?
      LIMIT 1
    `);
    const insert = db.prepare(`
      INSERT INTO busy_intervals (owner_id, start_utc, end_utc, source_revision, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    let previousEnd = "";
    for (const interval of projection.intervals) {
      if (previousEnd && interval.startUtc <= previousEnd) {
        throw new BusyIntervalConflictError("Busy intervals overlap or are not coalesced");
      }
      if (conflictQuery.get(ownerId, interval.endUtc, interval.startUtc)) {
        throw new BusyIntervalConflictError("Busy intervals overlap");
      }
      insert.run(ownerId, interval.startUtc, interval.endUtc, projection.revision, updatedAt);
      previousEnd = interval.endUtc;
    }

    db.prepare(`
      INSERT INTO booking_projection_state (owner_id, source_revision, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(owner_id) DO UPDATE SET source_revision = excluded.source_revision, updated_at = excluded.updated_at
    `).run(ownerId, projection.revision, updatedAt);

    return { ownerId, revision: projection.revision, intervalCount: projection.intervals.length, updatedAt };
  });

  return replace.immediate();
}
