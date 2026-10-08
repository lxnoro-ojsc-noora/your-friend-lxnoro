import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LxnoroDatabase, initializeDatabase } from "../src/data/database";
import { setWeatherEnabled } from "../src/data/weatherPreferences";
import type { GeolocationPort } from "../src/platform/weatherLocation";

const databases: LxnoroDatabase[] = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map(async (db) => { await db.delete(); db.close(); }));
});

async function createDb(): Promise<LxnoroDatabase> {
  const db = new LxnoroDatabase(`weather-${crypto.randomUUID()}`);
  databases.push(db);
  await initializeDatabase(db);
  return db;
}

function locationApi(result: "grant" | "deny", getCurrentPosition = vi.fn()): GeolocationPort {
  getCurrentPosition.mockImplementation((success, failure) => {
    if (result === "grant") success({ coords: { latitude: 40.1792, longitude: 44.5126 } } as GeolocationPosition);
    else failure({ code: 1 } as GeolocationPositionError);
  });
  return { getCurrentPosition };
}

describe("local weather preference and location permission", () => {
  it("keeps weather disabled by default and makes no location request while disabled", async () => {
    const db = await createDb();
    const getCurrentPosition = vi.fn();
    await expect(setWeatherEnabled(db, false, locationApi("grant", getCurrentPosition))).resolves.toEqual({ status: "disabled" });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(await db.preferences.get("main")).toMatchObject({ weatherEnabled: false });
    expect((await db.preferences.get("main"))?.weatherCoordinates).toBeUndefined();
  });

  it("persists only two-decimal coordinates after permission is granted", async () => {
    const db = await createDb();
    await expect(setWeatherEnabled(db, true, locationApi("grant"))).resolves.toEqual({ status: "granted", coordinates: { latitude: 40.18, longitude: 44.51 } });
    expect(await db.preferences.get("main")).toMatchObject({ weatherEnabled: true, weatherCoordinates: { latitude: 40.18, longitude: 44.51 } });
  });

  it("leaves weather disabled and stores no coordinates when permission is denied", async () => {
    const db = await createDb();
    await expect(setWeatherEnabled(db, true, locationApi("deny"))).resolves.toEqual({ status: "denied" });
    const saved = await db.preferences.get("main");
    expect(saved?.weatherEnabled).not.toBe(true);
    expect(saved?.weatherCoordinates).toBeUndefined();
  });
});
