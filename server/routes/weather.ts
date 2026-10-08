import type { FastifyInstance } from "fastify";
import { fetchMetNorwayWeather, WeatherProviderError, type WeatherProviderOptions } from "../weather/metNorway";

export function registerWeatherRoutes(app: FastifyInstance, options: WeatherProviderOptions = {}): void {
  app.get<{ Querystring: { lat?: string; lon?: string } }>("/api/weather", async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    if (Object.keys(query).some((key) => key !== "lat" && key !== "lon") || typeof query.lat !== "string" || typeof query.lon !== "string") {
      return reply.code(400).send({ code: "invalid_coordinates" });
    }
    const latitude = Number(query.lat);
    const longitude = Number(query.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || !/^[-+]?\d+(?:\.\d{1,2})?$/.test(query.lat) || !/^[-+]?\d+(?:\.\d{1,2})?$/.test(query.lon)) {
      return reply.code(400).send({ code: "invalid_coordinates" });
    }

    try {
      return reply.send(await fetchMetNorwayWeather(latitude, longitude, options));
    } catch (error) {
      if (!(error instanceof WeatherProviderError)) return reply.code(502).send({ code: "weather_provider_unavailable" });
      if (error.code === "configuration_missing") return reply.code(503).send({ code: "weather_unavailable" });
      if (error.code === "provider_rate_limited") {
        if (error.retryAfterSeconds !== undefined) reply.header("retry-after", String(error.retryAfterSeconds));
        return reply.code(503).send({ code: error.code, ...(error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }) });
      }
      if (error.code === "invalid_response") return reply.code(502).send({ code: "weather_invalid_response" });
      return reply.code(502).send({ code: error.code === "provider_error" ? "weather_provider_error" : "weather_provider_unavailable" });
    }
  });
}
