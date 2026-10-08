import { getBookingSyncSnapshot, markBookingSnapshotSynced, replacePendingBookingSnapshot } from "../data/bookingSync";
import { database, type LxnoroDatabase } from "../data/database";
import { createBookingProjectionV1 } from "../domain/bookingProjection";
import { horizonBounds } from "../domain/time";
import { publishBookingProjection } from "./bookingApi";

export interface BookingSyncCoordinatorOptions {
  db?: LxnoroDatabase;
  developmentOwnerId?: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  eventTarget?: EventTarget;
  isOnline?: () => boolean;
  now?: () => Date;
}

/** Keeps the interval-only outbox current and best-effort publishes it online. */
export class BookingSyncCoordinator {
  private readonly db: LxnoroDatabase;
  private readonly eventTarget: EventTarget;
  private readonly isOnline: () => boolean;
  private readonly now: () => Date;
  private started = false;
  private serial = Promise.resolve();

  constructor(private readonly options: BookingSyncCoordinatorOptions = {}) {
    this.db = options.db ?? database;
    this.eventTarget = options.eventTarget ?? window;
    this.isOnline = options.isOnline ?? (() => typeof navigator !== "undefined" && navigator.onLine);
    this.now = options.now ?? (() => new Date());
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.eventTarget.addEventListener("online", this.handleOnline);
    void this.refreshProjection();
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.eventTarget.removeEventListener("online", this.handleOnline);
  }

  /** Called only after a local activity write succeeds; network errors are swallowed. */
  projectionChanged(): Promise<void> {
    return this.refreshProjection();
  }

  private readonly handleOnline = (): void => {
    void this.refreshProjection();
  };

  private refreshProjection(): Promise<void> {
    this.serial = this.serial.then(async () => {
      const activities = await this.db.activities.toArray();
      const previous = await getBookingSyncSnapshot(this.db);
      const revision = (previous?.revision ?? 0) + 1;
      const { start, end } = horizonBounds("fiveYears", this.now());
      const projection = createBookingProjectionV1(activities, revision, { start, end });
      await replacePendingBookingSnapshot(projection, this.db);

      if (!this.options.developmentOwnerId || !this.isOnline()) return;
      try {
        await publishBookingProjection(projection, {
          developmentOwnerId: this.options.developmentOwnerId,
          endpoint: this.options.endpoint,
          fetchImpl: this.options.fetchImpl,
        });
        await markBookingSnapshotSynced(revision, this.db);
      } catch {
        // Keep the pending interval-only snapshot; local planning has already succeeded.
      }
    }).catch(() => {
      // Projection/outbox failures must not escape into or interrupt local planning.
    });
    return this.serial;
  }
}
