export interface RoundedWeatherCoordinates {
  latitude: number;
  longitude: number;
}

export interface GeolocationPort {
  getCurrentPosition: (success: (position: GeolocationPosition) => void, failure: (error: GeolocationPositionError) => void, options?: PositionOptions) => void;
}

export type WeatherLocationResult =
  | { status: "disabled" }
  | { status: "granted"; coordinates: RoundedWeatherCoordinates }
  | { status: "denied" }
  | { status: "unavailable" };

export function roundWeatherCoordinates(latitude: number, longitude: number): RoundedWeatherCoordinates {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new RangeError("Geolocation returned invalid coordinates");
  }
  const round = (value: number) => {
    const result = Math.round(value * 100) / 100;
    return Object.is(result, -0) ? 0 : result;
  };
  return { latitude: round(latitude), longitude: round(longitude) };
}

export function requestWeatherLocation(enabled: boolean, geolocation?: GeolocationPort): Promise<WeatherLocationResult> {
  if (!enabled) return Promise.resolve({ status: "disabled" });
  if (!geolocation) return Promise.resolve({ status: "unavailable" });
  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      ({ coords }) => {
        try { resolve({ status: "granted", coordinates: roundWeatherCoordinates(coords.latitude, coords.longitude) }); }
        catch { resolve({ status: "unavailable" }); }
      },
      (error) => resolve({ status: error.code === 1 ? "denied" : "unavailable" }),
      { enableHighAccuracy: false, maximumAge: 15 * 60 * 1000, timeout: 10_000 },
    );
  });
}
