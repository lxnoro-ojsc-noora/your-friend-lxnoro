import type { LxnoroDatabase } from "./database";
import { requestWeatherLocation, type GeolocationPort, type WeatherLocationResult } from "../platform/weatherLocation";

export async function setWeatherEnabled(
  db: LxnoroDatabase,
  enabled: boolean,
  geolocation?: GeolocationPort,
): Promise<WeatherLocationResult> {
  const current = await db.preferences.get("main");
  if (!current) return { status: "unavailable" };
  if (!enabled) {
    const { weatherCoordinates: _coordinates, ...withoutCoordinates } = current;
    await db.preferences.put({ ...withoutCoordinates, weatherEnabled: false });
    return { status: "disabled" };
  }

  const result = await requestWeatherLocation(true, geolocation);
  if (result.status === "granted") {
    await db.preferences.put({ ...current, weatherEnabled: true, weatherCoordinates: result.coordinates });
  }
  return result;
}
