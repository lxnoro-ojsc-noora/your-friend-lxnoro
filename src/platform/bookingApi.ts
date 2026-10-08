import type { BookingProjectionV1 } from "../domain/bookingProjection";

export interface BookingProjectionPublishResult {
  revision: number;
  intervalCount: number;
  updatedAt: string;
}

export class BookingApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(`Booking projection publish failed (${code})`);
    this.name = "BookingApiError";
  }
}

export interface PublishBookingProjectionOptions {
  /** Local-only development identity; replace with the approved secure session when implemented. */
  developmentOwnerId: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

/** Transmits only the versioned interval projection; caller activity objects are never serialized. */
export async function publishBookingProjection(
  projection: BookingProjectionV1,
  options: PublishBookingProjectionOptions,
): Promise<BookingProjectionPublishResult> {
  const payload: BookingProjectionV1 = {
    schemaVersion: projection.schemaVersion,
    revision: projection.revision,
    coverageStartUtc: projection.coverageStartUtc,
    coverageEndUtc: projection.coverageEndUtc,
    intervals: projection.intervals.map(({ startUtc, endUtc }) => ({ startUtc, endUtc })),
  };
  const response = await (options.fetchImpl ?? fetch)(options.endpoint ?? "/api/owner/booking/busy-intervals", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-lxnoro-dev-owner-id": options.developmentOwnerId,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new BookingApiError(response.status, typeof result.code === "string" ? result.code : "request_failed");
  }
  if (result.revision !== projection.revision || result.intervalCount !== projection.intervals.length || typeof result.updatedAt !== "string") {
    throw new BookingApiError(response.status, "invalid_server_response");
  }
  return {
    revision: result.revision as number,
    intervalCount: result.intervalCount as number,
    updatedAt: result.updatedAt,
  };
}
