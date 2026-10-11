import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { savePushSubscription, deletePushSubscription } from "../db/repositories/pushSubscriptions";

export function registerPushRoutes(app: FastifyInstance, db: Database.Database): void {
  app.get("/api/push/vapid-key", async () => {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    };
  });

  app.post<{
    Body: {
      endpoint: string;
      ownerId?: string;
      keys: {
        p256dh: string;
        auth: string;
      };
    };
  }>("/api/push/subscribe", async (request, reply) => {
    const { endpoint, ownerId = "local-owner", keys } = request.body ?? {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return reply.status(400).send({ error: "Invalid push subscription payload" });
    }

    try {
      savePushSubscription(db, {
        endpoint,
        ownerId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        createdAtUtc: new Date().toISOString(),
      });
      return { status: "subscribed" };
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: "Failed to save push subscription" });
    }
  });

  app.delete<{
    Body: {
      endpoint: string;
    };
  }>("/api/push/subscribe", async (request, reply) => {
    const { endpoint } = request.body ?? {};
    if (!endpoint) {
      return reply.status(400).send({ error: "Endpoint required" });
    }
    try {
      deletePushSubscription(db, endpoint);
      return { status: "unsubscribed" };
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: "Failed to remove push subscription" });
    }
  });
}
