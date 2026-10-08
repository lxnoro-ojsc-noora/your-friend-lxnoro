export interface WeatherCoordinates {
  latitude: number;
  longitude: number;
}

export interface WeatherContext {
  provider: "MET Norway";
  attribution: "Weather data from MET Norway";
  forecastTime: string;
  fetchedAt: string;
  expiresAt: string;
  temperatureC: number;
  symbolCode: string | null;
  precipitationMm: number | null;
}

export type WeatherState =
  | { status: "available"; freshness: "fresh"; context: WeatherContext }
  | { status: "stale"; context: WeatherContext }
  | { status: "unavailable"; reason: "disabled" | "location" | "offline" | "network" };
