import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../server/app";

const apps: Array<ReturnType<typeof createServer>> = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

const forecast = {
  properties: {
    timeseries: [{
      time: "2026-10-08T08:00:00Z",
      data: {
        instant: { details: { air_temperature: 18.4 } },
        next_1_hours: { summary: { symbol_code: "rain" }, details: { precipitation_amount: 0.7 } },
      },
    }],
  },
};

function server(fetchImpl: typeof fetch) {
  const app = createServer(new Database(":memory:"), { weather: { fetchImpl, userAgent: "LXNORO-weather-tests contact=test@example.invalid" } });
  apps.push(app);
  return app;
}

describe("MET Norway weather proxy", () => {
  it("accepts rounded coordinates only and returns a normalized context", async () => {
    let requested: URL | undefined;
    let headers: HeadersInit | undefined;
    const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
      requested = new URL(String(input));
      headers = init?.headers;
      return Response.json(forecast);
    });
    const response = await server(fetchImpl).inject({ method: "GET", url: "/api/weather?lat=40.18&lon=44.51" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      provider: "MET Norway", attribution: "Weather data from MET Norway", forecastTime: "2026-10-08T08:00:00Z",
      temperatureC: 18.4, symbolCode: "rain", precipitationMm: 0.7,
    });
    expect(Date.parse(response.json().expiresAt)).toBeGreaterThan(Date.parse(response.json().fetchedAt));
    expect(requested?.origin).toBe("https://api.met.no");
    expect(requested?.pathname).toBe("/weatherapi/locationforecast/2.0/compact");
    expect([...requested!.searchParams.entries()]).toEqual([["lat", "40.18"], ["lon", "44.51"]]);
    expect(headers).toMatchObject({ "user-agent": "LXNORO-weather-tests contact=test@example.invalid", accept: "application/json" });
  });

  it("rejects malformed provider data without returning the raw payload", async () => {
    const response = await server(async () => Response.json({ privateProviderBody: "discard" })).inject({ method: "GET", url: "/api/weather?lat=40.18&lon=44.51" });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ code: "weather_invalid_response" });
    expect(response.body).not.toContain("privateProviderBody");
  });

  it("maps provider rate limiting to a sanitized retry response", async () => {
    const response = await server(async () => new Response("provider details", { status: 429, headers: { "retry-after": "120" } })).inject({ method: "GET", url: "/api/weather?lat=40.18&lon=44.51" });
    expect(response.statusCode).toBe(503);
    expect(response.headers["retry-after"]).toBe("120");
    expect(response.json()).toEqual({ code: "provider_rate_limited", retryAfterSeconds: 120 });
  });

  it("handles provider errors and network failures without exposing provider response bodies", async () => {
    const providerError = await server(async () => new Response("upstream internals", { status: 500 })).inject({ method: "GET", url: "/api/weather?lat=40.18&lon=44.51" });
    expect(providerError.statusCode).toBe(502);
    expect(providerError.json()).toEqual({ code: "weather_provider_error" });

    const networkFailure = await server(async () => { throw new TypeError("offline"); }).inject({ method: "GET", url: "/api/weather?lat=40.18&lon=44.51" });
    expect(networkFailure.statusCode).toBe(502);
    expect(networkFailure.json()).toEqual({ code: "weather_provider_unavailable" });
  });

  it("rejects unrounded or non-coordinate query parameters before calling the provider", async () => {
    const fetchImpl = vi.fn(async () => Response.json(forecast)) as typeof fetch;
    const app = server(fetchImpl);
    expect((await app.inject({ method: "GET", url: "/api/weather?lat=40.181&lon=44.51" })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/weather?lat=40.18&lon=44.51&notes=private" })).statusCode).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
