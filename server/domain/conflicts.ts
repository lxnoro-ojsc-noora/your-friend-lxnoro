import type { BookingProjectionV1, BusyIntervalV1 } from "../../src/domain/bookingProjection";

export class ProjectionInputError extends Error {
  constructor(message: string, readonly code = "invalid_projection") {
    super(message);
    this.name = "ProjectionInputError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key)) && allowed.every((key) => key in value);
}

function utcInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

/** Validate the canonical, interval-only v1 payload without retaining caller objects. */
export function parseBookingProjection(value: unknown): BookingProjectionV1 {
  if (!isObject(value) || !exactKeys(value, ["schemaVersion", "revision", "coverageStartUtc", "coverageEndUtc", "intervals"])) {
    throw new ProjectionInputError("Projection must contain only the versioned snapshot fields");
  }
  if (value.schemaVersion !== 1 || !Number.isSafeInteger(value.revision) || (value.revision as number) <= 0) {
    throw new ProjectionInputError("Projection schema version or revision is invalid");
  }
  if (!utcInstant(value.coverageStartUtc) || !utcInstant(value.coverageEndUtc) || value.coverageStartUtc >= value.coverageEndUtc) {
    throw new ProjectionInputError("Projection coverage must be an increasing UTC range");
  }
  if (!Array.isArray(value.intervals) || value.intervals.length > 10_000) {
    throw new ProjectionInputError("Projection intervals must be an array within the supported limit");
  }

  const intervals: BusyIntervalV1[] = [];
  let previousStart = "";
  for (const item of value.intervals) {
    if (!isObject(item) || !exactKeys(item, ["startUtc", "endUtc"]) || !utcInstant(item.startUtc) || !utcInstant(item.endUtc)) {
      throw new ProjectionInputError("Each interval must contain only valid UTC start and end instants");
    }
    if (item.startUtc >= item.endUtc || item.startUtc < value.coverageStartUtc || item.endUtc > value.coverageEndUtc) {
      throw new ProjectionInputError("Busy interval is invalid or outside projection coverage");
    }
    if (previousStart && item.startUtc < previousStart) {
      throw new ProjectionInputError("Busy intervals must be sorted by start time");
    }
    intervals.push({ startUtc: item.startUtc, endUtc: item.endUtc });
    previousStart = item.startUtc;
  }

  return {
    schemaVersion: 1,
    revision: value.revision as number,
    coverageStartUtc: value.coverageStartUtc,
    coverageEndUtc: value.coverageEndUtc,
    intervals,
  };
}

/** SQL uses the same half-open interval rule: [start, end). */
export function overlaps(startUtc: string, endUtc: string, other: BusyIntervalV1): boolean {
  return startUtc < other.endUtc && endUtc > other.startUtc;
}
