import type { ScheduledActivity } from "./model";
import { activityInstant } from "./time";

export interface BusyIntervalV1 {
  startUtc: string;
  endUtc: string;
}

/**
 * A complete replacement snapshot for one owner's busy intervals inside the
 * half-open UTC coverage range. Owner identity is supplied by authenticated
 * transport context and is deliberately absent from this payload.
 */
export interface BookingProjectionV1 {
  schemaVersion: 1;
  revision: number;
  coverageStartUtc: string;
  coverageEndUtc: string;
  intervals: BusyIntervalV1[];
}

export interface BookingProjectionWindow {
  start: Date;
  end: Date;
}

function requireValidWindow(window: BookingProjectionWindow): { startMs: number; endMs: number } {
  const startMs = window.start.getTime();
  const endMs = window.end.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    throw new RangeError("Booking projection coverage must be a valid, non-empty UTC range");
  }
  return { startMs, endMs };
}

export function coalesceBusyIntervals(intervals: readonly BusyIntervalV1[]): BusyIntervalV1[] {
  const sorted = intervals.map((interval) => {
    const startMs = Date.parse(interval.startUtc);
    const endMs = Date.parse(interval.endUtc);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
      throw new RangeError("Busy intervals must have valid, increasing UTC boundaries");
    }
    return { startMs, endMs };
  }).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const merged: Array<{ startMs: number; endMs: number }> = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (previous && interval.startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, interval.endMs);
    } else {
      merged.push({ ...interval });
    }
  }

  return merged.map(({ startMs, endMs }) => ({
    startUtc: new Date(startMs).toISOString(),
    endUtc: new Date(endMs).toISOString(),
  }));
}

export function createBookingProjectionV1(
  activities: readonly ScheduledActivity[],
  revision: number,
  window: BookingProjectionWindow,
): BookingProjectionV1 {
  if (!Number.isSafeInteger(revision) || revision <= 0) {
    throw new RangeError("Booking projection revision must be a positive safe integer");
  }

  const { startMs: coverageStartMs, endMs: coverageEndMs } = requireValidWindow(window);
  const intervals: BusyIntervalV1[] = [];

  for (const activity of activities) {
    if (activity.status !== "scheduled") continue;
    if (!Number.isSafeInteger(activity.durationMinutes) || activity.durationMinutes <= 0) {
      throw new RangeError("Scheduled activity duration must be a positive whole number of minutes");
    }

    const startMs = activityInstant(activity.startLocal, activity.timeZone).getTime();
    const endMs = startMs + activity.durationMinutes * 60_000;
    const clippedStartMs = Math.max(startMs, coverageStartMs);
    const clippedEndMs = Math.min(endMs, coverageEndMs);
    if (clippedStartMs < clippedEndMs) {
      intervals.push({ startUtc: new Date(clippedStartMs).toISOString(), endUtc: new Date(clippedEndMs).toISOString() });
    }
  }

  return {
    schemaVersion: 1,
    revision,
    coverageStartUtc: new Date(coverageStartMs).toISOString(),
    coverageEndUtc: new Date(coverageEndMs).toISOString(),
    intervals: coalesceBusyIntervals(intervals),
  };
}

/** Enforces monotonically increasing full-snapshot revisions before replacement. */
export function assertProjectionRevisionAdvances(projection: BookingProjectionV1, lastAcceptedRevision: number): void {
  if (!Number.isSafeInteger(lastAcceptedRevision) || lastAcceptedRevision < 0 || projection.revision <= lastAcceptedRevision) {
    throw new RangeError("Booking projection revision must advance beyond the last accepted snapshot");
  }
}
