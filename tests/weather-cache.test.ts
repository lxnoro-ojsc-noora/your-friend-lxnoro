import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LxnoroDatabase, initializeDatabase } from "../src/data/database";
import { loadWeatherState, type WeatherCacheRecord } from "../src/data/weatherCache";
import type { WeatherContext } from "../src/domain/weather";

const databases: LxnoroDatabase[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(async (db) => { await db.delete(); db.close(); })); });

const now = new Date("2026-10-08T10:00:00.000Z");
const coordinates = { latitude: 40.18, longitude: 44.51 };
const context = (expiresAt = "2026-10-08T10:10:00.000Z"): WeatherContext => ({
  provider: "MET Norway", attribution: "Weather data from MET Norway", forecastTime: "2026-10-08T10:00:00.000Z",
  fetchedAt: "2026-10-08T09:55:00.000Z", expiresAt, temperatureC: 18.4, symbolCode: "rain", precipitationMm: 0.7,
});

async function createDb(record?: WeatherCacheRecord): Promise<LxnoroDatabase> {
  const db = new LxnoroDatabase(`weather-cache-${crypto.randomUUID()}`);
  databases.push(db);
  await initializeDatabase(db);
  if (record) await db.weatherCache.put(record);
  return db;
}

const record = (value: WeatherContext): WeatherCacheRecord => ({ id: "40.18,44.51", latitude: 40.18, longitude: 44.51, context: value, updatedAt: value.fetchedAt });
const successResponse = (value: WeatherContext) => Response.json(value);

describe("local weather cache and availability state", () => {
  it("uses a fresh local cache without making a network request and retains attribution", async () => {
    const db = await createDb(record(context()));
    const fetchImpl = vi.fn(async () => successResponse(context())) as typeof fetch;
    const state = await loadWeatherState(db, { enabled: true, coordinates, online: true, now: () => now, fetchImpl });
    expect(state).toMatchObject({ status: "available", freshness: "fresh", context: { attribution: "Weather data from MET Norway", temperatureC: 18.4 } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a stale cached forecast when offline", async () => {
    const db = await createDb(record(context("2026-10-08T09:59:00.000Z")));
    const fetchImpl = vi.fn() as typeof fetch;
    const state = await loadWeatherState(db, { enabled: true, coordinates, online: false, now: () => now, fetchImpl });
    expect(state).toMatchObject({ status: "stale", context: { attribution: "Weather data from MET Norway" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns unavailable offline without a cached forecast", async () => {
    const db = await createDb();
    const state = await loadWeatherState(db, { enabled: true, coordinates, online: false, now: () => now });
    expect(state).toEqual({ status: "unavailable", reason: "offline" });
  });

  it("falls back to stale data when refresh fails and reports unavailable when no cache exists", async () => {
    const failingFetch: typeof fetch = async () => { throw new TypeError("offline"); };
    const staleDb = await createDb(record(context("2026-10-08T09:59:00.000Z")));
    await expect(loadWeatherState(staleDb, { enabled: true, coordinates, online: true, now: () => now, fetchImpl: failingFetch })).resolves.toMatchObject({ status: "stale" });

    const emptyDb = await createDb();
    await expect(loadWeatherState(emptyDb, { enabled: true, coordinates, online: true, now: () => now, fetchImpl: failingFetch })).resolves.toEqual({ status: "unavailable", reason: "network" });
  });

  it("stores a normalized successful response locally with its attribution and expiry", async () => {
    const db = await createDb();
    const payload = context("2026-10-08T10:15:00.000Z");
    const fetchImpl: typeof fetch = vi.fn(async (input) => {
      const url = new URL(String(input));
      expect([...url.searchParams.keys()].sort()).toEqual(["lat", "lon"]);
      return successResponse(payload);
    });
    const state = await loadWeatherState(db, { enabled: true, coordinates, online: true, now: () => now, fetchImpl });
    expect(state).toMatchObject({ status: "available", context: { attribution: "Weather data from MET Norway", expiresAt: payload.expiresAt } });
    expect(await db.weatherCache.get("40.18,44.51")).toMatchObject({ context: { attribution: "Weather data from MET Norway" } });
  });
});
