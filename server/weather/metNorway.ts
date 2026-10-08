import type { WeatherContext } from "../../src/domain/weather";

export type { WeatherContext } from "../../src/domain/weather";

export type WeatherProviderErrorCode = "configuration_missing" | "provider_rate_limited" | "provider_unavailable" | "provider_error" | "invalid_response";

export class WeatherProviderError extends Error {
  constructor(readonly code: WeatherProviderErrorCode, readonly retryAfterSeconds?: number) {
    super(code);
    this.name = "WeatherProviderError";
  }
}

export interface WeatherProviderOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  now?: () => Date;
  fallbackTtlMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function retrySeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1000)) : undefined;
}

export async function fetchMetNorwayWeather(latitude: number, longitude: number, options: WeatherProviderOptions = {}): Promise<WeatherContext> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || Math.round(latitude * 100) !== latitude * 100 || Math.round(longitude * 100) !== longitude * 100) {
    throw new WeatherProviderError("invalid_response");
  }
  const userAgent = options.userAgent ?? process.env.LX_MET_USER_AGENT;
  if (!userAgent?.trim()) throw new WeatherProviderError("configuration_missing");

  const url = new URL("https://api.met.no/weatherapi/locationforecast/2.0/compact");
  url.searchParams.set("lat", latitude.toFixed(2));
  url.searchParams.set("lon", longitude.toFixed(2));
  const fetchedAt = (options.now ?? (() => new Date()))();
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method: "GET",
      headers: { "user-agent": userAgent.trim(), accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new WeatherProviderError("provider_unavailable");
  }
  if (response.status === 429) throw new WeatherProviderError("provider_rate_limited", retrySeconds(response.headers.get("retry-after")));
  if (!response.ok) throw new WeatherProviderError("provider_error");
  const upstreamExpiry = response.headers.get("expires");
  const parsedExpiry = upstreamExpiry ? Date.parse(upstreamExpiry) : Number.NaN;
  const expiresAt = Number.isFinite(parsedExpiry) ? new Date(parsedExpiry) : new Date(fetchedAt.getTime() + (options.fallbackTtlMs ?? 10 * 60_000));

  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new WeatherProviderError("invalid_response"); }

  const properties = isRecord(payload) && isRecord(payload.properties) ? payload.properties : undefined;
  const series = properties && Array.isArray(properties.timeseries) ? properties.timeseries : undefined;
  const first = series?.find((entry) => isRecord(entry) && typeof entry.time === "string" && isRecord(entry.data));
  const data = isRecord(first) && isRecord(first.data) ? first.data : undefined;
  const instant = data && isRecord(data.instant) && isRecord(data.instant.details) ? data.instant.details : undefined;
  const temperatureC = finiteNumber(instant?.air_temperature);
  if (!isRecord(first) || typeof first.time !== "string" || !Number.isFinite(Date.parse(first.time)) || temperatureC === null) {
    throw new WeatherProviderError("invalid_response");
  }

  const nextHour = isRecord(data?.next_1_hours) ? data.next_1_hours : undefined;
  const summary = nextHour && isRecord(nextHour.summary) ? nextHour.summary : undefined;
  const details = nextHour && isRecord(nextHour.details) ? nextHour.details : undefined;
  const symbol = typeof summary?.symbol_code === "string" && summary.symbol_code.length <= 80 ? summary.symbol_code : null;
  const precipitation = finiteNumber(details?.precipitation_amount);
  return {
    provider: "MET Norway",
    attribution: "Weather data from MET Norway",
    forecastTime: first.time,
    fetchedAt: fetchedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    temperatureC,
    symbolCode: symbol,
    precipitationMm: precipitation,
  };
}
