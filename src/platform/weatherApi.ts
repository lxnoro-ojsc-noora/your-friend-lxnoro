import type { WeatherContext, WeatherCoordinates } from "../domain/weather";

export class WeatherApiError extends Error {
  constructor(readonly code: string) { super(code); this.name = "WeatherApiError"; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function fetchWeatherContext(
  coordinates: WeatherCoordinates,
  fetchImpl: typeof fetch = fetch,
  endpoint = "/api/weather",
): Promise<WeatherContext> {
  const url = new URL(endpoint, typeof location === "undefined" ? "http://localhost" : location.origin);
  url.searchParams.set("lat", coordinates.latitude.toFixed(2));
  url.searchParams.set("lon", coordinates.longitude.toFixed(2));
  let response: Response;
  try { response = await fetchImpl(url, { method: "GET", headers: { accept: "application/json" } }); }
  catch { throw new WeatherApiError("network"); }
  if (!response.ok) {
    let code = "unavailable";
    try {
      const body: unknown = await response.json();
      if (isRecord(body) && typeof body.code === "string") code = body.code;
    } catch { /* Error bodies are optional and are never surfaced directly. */ }
    throw new WeatherApiError(code);
  }

  let value: unknown;
  try { value = await response.json(); }
  catch { throw new WeatherApiError("invalid_response"); }
  if (!isRecord(value) || value.provider !== "MET Norway" || value.attribution !== "Weather data from MET Norway" || typeof value.forecastTime !== "string" || !Number.isFinite(Date.parse(value.forecastTime)) || typeof value.fetchedAt !== "string" || !Number.isFinite(Date.parse(value.fetchedAt)) || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt)) || typeof value.temperatureC !== "number" || !Number.isFinite(value.temperatureC) || !(value.symbolCode === null || typeof value.symbolCode === "string") || !(value.precipitationMm === null || (typeof value.precipitationMm === "number" && Number.isFinite(value.precipitationMm)))) {
    throw new WeatherApiError("invalid_response");
  }
  return {
    provider: "MET Norway",
    attribution: "Weather data from MET Norway",
    forecastTime: value.forecastTime,
    fetchedAt: value.fetchedAt,
    expiresAt: value.expiresAt,
    temperatureC: value.temperatureC,
    symbolCode: value.symbolCode as string | null,
    precipitationMm: value.precipitationMm as number | null,
  };
}
