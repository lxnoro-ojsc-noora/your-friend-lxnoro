import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { replaceOwnerBusyIntervals, BusyIntervalConflictError, StaleProjectionError } from "../db/repositories/busyIntervals";
import { ProjectionInputError } from "../domain/conflicts";

export interface OwnerRouteOptions {
  developmentAuth: boolean;
}

export function registerOwnerRoutes(app: FastifyInstance, db: Database.Database, options: OwnerRouteOptions): void {
  app.put("/api/owner/booking/busy-intervals", async (request, reply) => {
    if (!options.developmentAuth || process.env.NODE_ENV === "production") {
      return reply.code(503).send({ code: "owner_auth_unavailable" });
    }
    const ownerHeader = request.headers["x-lxnoro-dev-owner-id"];
    const ownerId = typeof ownerHeader === "string" ? ownerHeader.trim() : "";
    if (!ownerId || ownerId.length > 128) return reply.code(401).send({ code: "owner_auth_required" });

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
