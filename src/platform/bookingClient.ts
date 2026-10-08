import type { BookingLinkId, BookingRequestSubmission, OwnerAvailabilityConfiguration } from "../domain/booking";

export interface PublicSlot { startUtc: string; endUtc: string; durationMinutes: number }
export interface PublicAvailability { timeZone: string; availableSlots: PublicSlot[] }
export interface OwnerBookingRequest {
  id: string; requesterName: string; requesterEmail: string; requesterNote?: string;
  requestedStartUtc: string; requestedEndUtc: string; durationMinutes: number;
  status: "pending" | "approved" | "rejected"; createdAtUtc: string; updatedAtUtc: string;
}
export type OwnerBookingConfiguration = Omit<OwnerAvailabilityConfiguration, "bookingLinkId">;
const OWNER = "local-owner";

async function json<T>(response: Response): Promise<T> {
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error("booking_response_invalid"); }
  if (!response.ok) throw new Error(typeof (body as { code?: unknown })?.code === "string" ? (body as { code: string }).code : "booking_request_failed");
  return body as T;
}
function ownerHeaders(): HeadersInit { return { "x-lxnoro-dev-owner-id": OWNER, "content-type": "application/json" }; }

export async function saveOwnerBookingConfiguration(
  configuration: OwnerBookingConfiguration & { bookingLinkId: BookingLinkId }, fetchImpl: typeof fetch = fetch,
): Promise<void> {
  await json(await fetchImpl("/api/owner/booking/configuration", { method: "PUT", headers: ownerHeaders(), body: JSON.stringify(configuration) }));
}
export async function listPendingBookingRequests(fetchImpl: typeof fetch = fetch): Promise<OwnerBookingRequest[]> {
  const result = await json<{ requests: OwnerBookingRequest[] }>(await fetchImpl("/api/owner/booking/requests?status=pending", { headers: ownerHeaders() }));
  if (!Array.isArray(result.requests)) throw new Error("booking_response_invalid");
  return result.requests;
}
export async function decideBookingRequest(id: string, decision: "approved" | "rejected", fetchImpl: typeof fetch = fetch): Promise<void> {
  await json(await fetchImpl(`/api/owner/booking/requests/${encodeURIComponent(id)}/decision`, { method: "POST", headers: ownerHeaders(), body: JSON.stringify({ decision }) }));
}
export async function getPublicAvailability(linkId: string, fromUtc: string, toUtc: string, fetchImpl: typeof fetch = fetch): Promise<PublicAvailability> {
  const query = new URLSearchParams({ fromUtc, toUtc });
  const result = await json<PublicAvailability>(await fetchImpl(`/api/public/booking/${encodeURIComponent(linkId)}/availability?${query}`));
  if (typeof result.timeZone !== "string" || !Array.isArray(result.availableSlots)) throw new Error("booking_response_invalid");
  return result;
}
export async function submitPublicBookingRequest(linkId: string, request: BookingRequestSubmission, fetchImpl: typeof fetch = fetch): Promise<{ requestId: string; status: "pending" }> {
  const result = await json<{ requestId: string; status: "pending" }>(await fetchImpl(`/api/public/booking/${encodeURIComponent(linkId)}/requests`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request),
  }));
  if (!result.requestId || result.status !== "pending") throw new Error("booking_response_invalid");
  return result;
}
