import type { WeatherContext, WeatherCoordinates, WeatherState } from "../domain/weather";
import type { LxnoroDatabase } from "./database";
import { fetchWeatherContext } from "../platform/weatherApi";

export interface WeatherCacheRecord {
  id: string;
  latitude: number;
  longitude: number;
  context: WeatherContext;
  updatedAt: string;
}

export function weatherCacheKey(coordinates: WeatherCoordinates): string {
  return `${coordinates.latitude.toFixed(2)},${coordinates.longitude.toFixed(2)}`;
}

export interface WeatherStateOptions {
  enabled: boolean;
  coordinates?: WeatherCoordinates;
  online: boolean;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}

export async function loadWeatherState(db: LxnoroDatabase, options: WeatherStateOptions): Promise<WeatherState> {
  if (!options.enabled) return { status: "unavailable", reason: "disabled" };
  if (!options.coordinates) return { status: "unavailable", reason: "location" };
  const now = options.now?.() ?? new Date();
  const id = weatherCacheKey(options.coordinates);
  let cached: WeatherCacheRecord | undefined;
  try { cached = await db.weatherCache.get(id); }
  catch { /* A cache read failure must not disable an online lookup. */ }
  if (cached && Date.parse(cached.context.expiresAt) > now.getTime()) {
    return { status: "available", freshness: "fresh", context: cached.context };
  }
  if (!options.online) {
    return cached ? { status: "stale", context: cached.context } : { status: "unavailable", reason: "offline" };
  }

  try {
    const context = await fetchWeatherContext(options.coordinates, options.fetchImpl);
    try { await db.weatherCache.put({ id, latitude: options.coordinates.latitude, longitude: options.coordinates.longitude, context, updatedAt: now.toISOString() }); }
    catch { /* The live forecast remains usable if local cache storage is unavailable. */ }
    return Date.parse(context.expiresAt) > now.getTime()
      ? { status: "available", freshness: "fresh", context }
      : { status: "stale", context };
  } catch {
    return cached ? { status: "stale", context: cached.context } : { status: "unavailable", reason: "network" };
  }
}
