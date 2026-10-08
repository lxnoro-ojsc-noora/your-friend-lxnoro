import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { getOwnerBusyIntervalSnapshot, replaceOwnerBusyIntervals, BusyIntervalConflictError, StaleProjectionError } from "../db/repositories/busyIntervals";
import { ProjectionInputError } from "../domain/conflicts";

export interface OwnerRouteOptions {
  developmentAuth: boolean;
}

export function registerOwnerRoutes(app: FastifyInstance, db: Database.Database, options: OwnerRouteOptions): void {
  const requireDevelopmentOwner = (request: { headers: Record<string, string | string[] | undefined> }, reply: { code: (status: number) => { send: (payload: unknown) => unknown } }): string | undefined => {
    if (!options.developmentAuth || process.env.NODE_ENV === "production") {
      reply.code(503).send({ code: "owner_auth_unavailable" });
      return undefined;
    }
    const ownerHeader = request.headers["x-lxnoro-dev-owner-id"];
    const ownerId = typeof ownerHeader === "string" ? ownerHeader.trim() : "";
    if (!ownerId || ownerId.length > 128) {
      reply.code(401).send({ code: "owner_auth_required" });
      return undefined;
    }
    return ownerId;
  };

  app.get("/api/owner/booking/busy-intervals", async (request, reply) => {
    const ownerId = requireDevelopmentOwner(request, reply);
    if (!ownerId) return;
    const snapshot = getOwnerBusyIntervalSnapshot(db, ownerId);
    return reply.send(snapshot);
  });

  app.put("/api/owner/booking/busy-intervals", async (request, reply) => {
    const ownerId = requireDevelopmentOwner(request, reply);
    if (!ownerId) return;

    try {
      const result = replaceOwnerBusyIntervals(db, ownerId, request.body);
      return reply.code(200).send({ revision: result.revision, intervalCount: result.intervalCount, updatedAt: result.updatedAt });
    } catch (error) {
      if (error instanceof ProjectionInputError) {
        const code = error.code === "overlapping_intervals" ? error.code : "invalid_projection";
        return reply.code(error.code === "overlapping_intervals" ? 409 : 400).send({ code });
      }
      if (error instanceof BusyIntervalConflictError) return reply.code(409).send({ code: error.code });
      if (error instanceof StaleProjectionError) return reply.code(409).send({ code: error.code });
      request.log.error({ err: error }, "Busy interval projection replacement failed");
      return reply.code(500).send({ code: "projection_publish_failed" });
    }
  });
}
