import type { BookingProjectionV1, BusyIntervalV1 } from "../domain/bookingProjection";
import { assertProjectionRevisionAdvances, coalesceBusyIntervals } from "../domain/bookingProjection";
import { database, type LxnoroDatabase } from "./database";

export type BookingSyncStatus = "pending" | "synced";

/** The singleton local queue contains no source activity identity or content. */
export interface BookingSyncOutboxRecord {
  id: "current";
  revision: number;
  intervals: BusyIntervalV1[];
  syncStatus: BookingSyncStatus;
}

export interface ServerBookingSnapshot {
  ownerId: string;
  revision: number;
  intervals: BusyIntervalV1[];
  syncStatus: "synced";
  updatedAt: string | null;
}

const OUTBOX_ID = "current";

/**
 * Replaces the queued snapshot atomically. An empty interval list is a valid
 * replacement and clears the previous snapshot, including after deletions.
 */
export async function replacePendingBookingSnapshot(
  projection: BookingProjectionV1,
  db: LxnoroDatabase = database,
): Promise<BookingSyncOutboxRecord> {
  if (projection.schemaVersion !== 1) {
    throw new RangeError("Unsupported booking projection schema version");
  }

  const intervals = coalesceBusyIntervals(projection.intervals);
  return db.transaction("rw", db.bookingSyncOutbox, async () => {
    const current = await db.bookingSyncOutbox.get(OUTBOX_ID);
    assertProjectionRevisionAdvances(projection, current?.revision ?? 0);
    const record: BookingSyncOutboxRecord = {
      id: OUTBOX_ID,
      revision: projection.revision,
      intervals,
      syncStatus: "pending",
    };
    await db.bookingSyncOutbox.put(record);
    return record;
  });
}

export function getBookingSyncSnapshot(
  db: LxnoroDatabase = database,
): Promise<BookingSyncOutboxRecord | undefined> {
  return db.bookingSyncOutbox.get(OUTBOX_ID);
}

/** Accept only a strictly newer server snapshot; a pending local projection always wins. */
export async function acceptNewerServerBookingSnapshot(
  snapshot: ServerBookingSnapshot,
  db: LxnoroDatabase = database,
): Promise<boolean> {
  // Revision zero denotes an empty server with no published projection, not a snapshot to adopt.
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision <= 0 || snapshot.syncStatus !== "synced") return false;
  const intervals = coalesceBusyIntervals(snapshot.intervals);
  return db.transaction("rw", db.bookingSyncOutbox, async () => {
    const current = await db.bookingSyncOutbox.get(OUTBOX_ID);
    if (current?.syncStatus === "pending" || snapshot.revision <= (current?.revision ?? -1)) return false;
    await db.bookingSyncOutbox.put({ id: OUTBOX_ID, revision: snapshot.revision, intervals, syncStatus: "synced" });
    return true;
  });
}

/** Ignore late acknowledgements for snapshots that have since been replaced. */
export async function markBookingSnapshotSynced(
  acknowledgedRevision: number,
  db: LxnoroDatabase = database,
): Promise<boolean> {
  return db.transaction("rw", db.bookingSyncOutbox, async () => {
    const current = await db.bookingSyncOutbox.get(OUTBOX_ID);
    if (!current || current.revision !== acknowledgedRevision) return false;
    await db.bookingSyncOutbox.put({ ...current, syncStatus: "synced" });
    return true;
  });
}
