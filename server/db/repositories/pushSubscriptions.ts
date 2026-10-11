import Database from "better-sqlite3";

export interface PushSubscriptionRecord {
  endpoint: string;
  ownerId: string;
  p256dh: string;
  auth: string;
  createdAtUtc: string;
}

export function savePushSubscription(db: Database.Database, sub: PushSubscriptionRecord): void {
  db.prepare(`
    INSERT OR REPLACE INTO push_subscriptions(endpoint, owner_id, p256dh, auth, created_at_utc)
    VALUES(?, ?, ?, ?, ?)
  `).run(sub.endpoint, sub.ownerId, sub.p256dh, sub.auth, sub.createdAtUtc);
}

export function deletePushSubscription(db: Database.Database, endpoint: string): void {
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

export function getPushSubscriptionsForOwner(db: Database.Database, ownerId: string): PushSubscriptionRecord[] {
  const rows = db.prepare("SELECT endpoint, owner_id AS ownerId, p256dh, auth, created_at_utc AS createdAtUtc FROM push_subscriptions WHERE owner_id = ?").all(ownerId) as Array<{
    endpoint: string;
    ownerId: string;
    p256dh: string;
    auth: string;
    createdAtUtc: string;
  }>;
  return rows;
}
