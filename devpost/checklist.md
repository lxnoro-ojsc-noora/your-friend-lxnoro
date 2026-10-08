---
doc: checklist
status: approved
---

# Build Checklist — Your friend LXNORO

Build mode: fast

## Slices

- [x] **1. You can shape and save your day in LXNORO's time matrix**
  Becomes usable: A running, responsive first-use screen shows the current date/time, horizontal time scale, Now position, visible unscheduled starter activities, and an empty structured daily grid. The user can configure/schedule a starter or create, edit, and remove a custom emoji-and-label activity; scheduled items persist locally. English/Arabic direction and strings are foundational from this slice.
  Why now: Delivers the product's visual kernel and a real local end-to-end path immediately, while establishing component boundaries, the local data model, and localization before later behavior depends on them.
  PRD ref: `prd.md > The Core Journey`, `prd.md > Time-matrix experience`, `prd.md > Profile and preferences`, `prd.md > Time horizons and shared schedule model`, `prd.md > Starter activities, routines, tasks, and custom activities`
  Spec ref: `spec.md > Stack`, `spec.md > Where It Runs and How Someone Tries It`, `spec.md > Look and Feel`, `spec.md > Time Matrix and Horizon Navigation`, `spec.md > Activity, Routine, Task, and Starter Editor`, `spec.md > Local Repository and Preferences`, `spec.md > Responsive Layout, Watch Surface, Accessibility, and Localization`, `spec.md > File Structure`
  Build: Bootstrap the TypeScript/React/Vite app within the first usable behavior; set strict typing, CSS tokens, English/Arabic catalogs and RTL/LTR direction; implement the daily matrix and first-use empty state with visible editable starter foundations; implement create/edit/remove/schedule for an activity; persist it with Dexie; add the app-shell service worker for offline reopening; add `.gitignore` rules for generated dependencies/build output and local booking database/secrets while preserving existing learner-profile and environment-file exclusions.
  Verify (mechanical): `npm.cmd run typecheck`; `npm.cmd test`; `npm.cmd run build`; run `npm.cmd run dev:web`, create/schedule an activity, reload, and confirm it remains; reopen after the first load while offline and confirm the local matrix still renders.
  Learner check: Open the app at phone width, inspect the empty grid and visible starter activities, switch English/Arabic, schedule one activity, reload, and confirm its symbol, label, and position are clear.
  Commit: `Build local-first time matrix foundation`

- [x] **2. A due activity returns with its complete note and supported reminder**
  Becomes usable: A timed task supports an expandable/collapsible substantial note, alert setting, status/completion, and an intentional Micro-Bot reminder that reveals the complete saved note when due while the app is active. Unsupported or denied delivery channels fail independently and visibly.
  Why now: This is the intention-to-action kernel and the primary demonstration moment; proving persistence, due-time calculation, and useful reminder content early exposes the riskiest client behavior before broader planning surfaces.
  PRD ref: `prd.md > The Core Journey`, `prd.md > Notes`, `prd.md > Micro-Bot reminders and platform behavior`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > The Core Journey Through the System`, `spec.md > Notes Editor and Activity Detail`, `spec.md > Scheduling and Recurrence Domain`, `spec.md > Reminder Scheduler and Delivery Adapters`, `spec.md > Private browser database (Dexie/IndexedDB)`, `spec.md > Important Failure Modes`
  Build: Extend the shared activity model with time, duration, alert, note, and completion; implement the compact/focused note editor and full-note detail; calculate due instances from local data; add in-app and supported Notification API, sound, and vibration adapters with permission/gesture handling; recompute after visibility/focus/resume rather than trusting suspended timers; never claim silent-mode detection or guaranteed closed-tab delivery.
  Verify (mechanical): `npm.cmd run typecheck`; `npm.cmd test` for note persistence, due-instance calculations, completion, and delivery fallback; run the app and verify a near-future task produces one reminder with its entire note and completion persists after reload.
  Learner check: Create a timed activity with a long note, collapse it, let it become due, and verify the reminder gives enough information to act and completion updates the schedule.
  Commit: `Add task notes and Micro-Bot reminders`

- [ ] **3. The local time model safely connects to LXNORO's booking boundary**
  Becomes usable: A private scheduled activity produces only anonymous, coalesced busy time intervals for the LXNORO booking service. The server persists those intervals and can reject an overlapping booking operation; the local schedule, labels, notes, and activity identities remain on device. The owner can see projection sync status.
  Why now: This is the highest-risk boundary between the local time model and network booking. Validate its data contract, timezone representation, privacy, and conflict behavior before adding more recurrence and horizon complexity.
  PRD ref: `prd.md > Time horizons and shared schedule model`, `prd.md > Shared Scheduling and Appointment Booking`, `prd.md > Localization, privacy, offline behavior, and AI boundaries`
  Spec ref: `spec.md > Owner Booking Console and Availability Projection`, `spec.md > LXNORO Booking API and SQLite Repository`, `spec.md > Private browser database (Dexie/IndexedDB)`, `spec.md > LXNORO-hosted booking database (SQLite)`, `spec.md > Booking API contract (same-origin HTTPS)`, `spec.md > Decisions and Open Issues`
  Build: Define the versioned interval-only projection contract from scheduled activities; coalesce overlapping busy ranges without retaining source activity IDs; implement the authenticated owner sync endpoint, minimal SQLite interval table, conflict query, local sync indicator and offline interval-only outbox; keep local planning usable offline and require sync/connectivity before owner booking mutations. Do not build the public booking flow in this slice.
  Verify (mechanical): `npm.cmd run typecheck`; `npm.cmd test`; run the client/server integration locally and verify schedule-to-projection sync and overlapping-interval rejection; inspect the serialized payload and SQLite schema to confirm there are no task/event IDs, titles, notes, reasons, categories, or full schedule records; verify queued intervals sync after reconnect.
  Learner check: Create a private activity, confirm only its necessary busy interval reaches the booking service, and verify the local title/note are absent while an overlapping booking check is rejected.
  Commit: `Validate privacy-safe booking projection boundary`

- [ ] **4. Routines, recurrence, and all five planning horizons share one schedule**
  Becomes usable: The user can create routines and custom activity types, repeat activities with supported count/interval rules, complete or postpone instances, and navigate daily, weekly, monthly, yearly, and five-year views without losing context.
  Why now: Expands the proven daily kernel into the complete time system using the same domain model, instead of building disconnected calendar implementations.
  PRD ref: `prd.md > Time horizons and shared schedule model`, `prd.md > Starter activities, routines, tasks, and custom activities`, `prd.md > Time-matrix experience`, `prd.md > Responsive surfaces`
  Spec ref: `spec.md > Scheduling and Recurrence Domain`, `spec.md > Time Matrix and Horizon Navigation`, `spec.md > Activity, Routine, Task, and Starter Editor`, `spec.md > Data Model`
  Build: Add routine/custom activity editing, recurrence rule representation and expansion with local wall-clock/IANA-zone semantics, count/end handling, completion/postpone behavior, and horizon-range queries; render all five horizons from shared records at appropriate detail levels.
  Verify (mechanical): `npm.cmd run typecheck`; `npm.cmd test` across recurrence boundaries, timezone/DST transitions, horizon range mapping, completion, and postponement; run the app and navigate each horizon with a recurring activity, confirming the same item is represented consistently.
  Learner check: Create a recurring routine, complete or postpone one occurrence, then move through all five horizons and check that context and next activity remain understandable.
  Commit: `Add recurring routines and planning horizons`

- [ ] **5. Optional weather context supports the selected location and fails gracefully**
  Becomes usable: After the user enables weather and grants location permission, relevant forecast context can appear with attribution and freshness time; denied permission, missing network, or provider failure leaves planning intact.
  Why now: Weather is a contextual enhancement to the already working activity/reminder flow, not a dependency of the local core; the integration is isolated and permission-driven.
  PRD ref: `prd.md > Weather and contextual information`, `prd.md > Profile and preferences`, `prd.md > Localization, privacy, offline behavior, and AI boundaries`
  Spec ref: `spec.md > Weather Context Adapter`, `spec.md > External Services and Dependencies`, `spec.md > Important Failure Modes`, `spec.md > Data Model`
  Build: Implement the user-controlled location permission path, LXNORO weather proxy and MET Norway adapter, coordinate rounding, cache handling/attribution, normalized context presentation, and unavailable/offline states; transmit no personal schedule content.
  Verify (mechanical): `npm.cmd run typecheck`; `npm.cmd test` with mocked success, stale-cache, denied-location, offline, rate-limit, and malformed-response cases; run one permitted online lookup and confirm weather failure does not affect task creation or reminders.
  Learner check: Enable weather with permission, verify its location/freshness and contextual placement, then deny or disable access and confirm the time matrix continues to work.
  Commit: `Add optional permission-based weather context`

- [ ] **6. Requesters can submit private, conflict-checked booking requests for owner approval**
  Becomes usable: An owner can configure a link and availability rules; requesters see available slots only and submit their name, email, optional note, day/time, and allowed duration; each request remains Pending until the owner explicitly approves or rejects. A valid approval creates a scheduled appointment and attempts the required confirmation email.
  Why now: Shared booking is core scope and a distinct network-dependent subsystem. This slice proves the public-to-owner-to-confirmed journey and privacy boundary before adding alternative and reminder edge cases.
  PRD ref: `prd.md > Shared appointment-booking journey`, `prd.md > Booking surfaces`, `prd.md > Shared Scheduling and Appointment Booking`, `prd.md > Localization, privacy, offline behavior, and AI boundaries`
  Spec ref: `spec.md > LXNORO Booking API and SQLite Repository`, `spec.md > Booking Link and Requester Page`, `spec.md > Owner Booking Console and Availability Projection`, `spec.md > Local Repository and Preferences`, `spec.md > LXNORO-hosted booking database (SQLite)`, `spec.md > Booking API contract (same-origin HTTPS)`, `spec.md > LXNORO booking host`, `spec.md > LXNORO SMTP relay`, `spec.md > Decisions and Open Issues`
  Build: Bootstrap the booking server only after verifying LXNORO hosting requirements or document a local-server path; add minimum SQLite state, owner authentication, secure opaque share links, configurable duration/windows/notice/buffer/timezone/expiry rules, interval-only sync on app open/reconnect, availability-only public responses, requester form, Pending owner queue and explicit approval/rejection; serialize conflict check plus state mutation; add local confirmed-appointment projection and SMTP confirmation adapter with durable delivery status. No full schedule, task identity, private titles, notes, or reasons enter the booking service/outbox.
  Verify (mechanical): `npm.cmd run typecheck`; `npm.cmd test` for API validation, booking state transitions, time-zone conversion, privacy response shape, simultaneous conflicting submissions/approvals, and transaction rollback; run requester-to-owner approval end to end with a configured test SMTP relay or clearly report that mail delivery cannot be verified without LXNORO credentials.
  Learner check: Configure a booking link, inspect the public view for availability-only disclosure, submit a request, confirm it stays Pending, then approve it and see the confirmed appointment enter the owner's time matrix.
  Commit: `Add private shared booking approval flow`

- [ ] **7. Alternatives, time-aware owner reminders, and delivery recovery complete booking behavior**
  Becomes usable: The owner can reject and propose any alternative day/time/duration; requester acceptance rechecks availability before confirmation, while rejection closes without an appointment. Pending reminders follow the same-day and 24-hour/every-three-hour cadence outside sleep/rest. Confirmation failures retry safely and notify the owner without undoing the confirmed appointment.
  Why now: Builds on the verified pending/approval path and completes the booking lifecycle's most consequential concurrency, privacy, and reliability edges.
  PRD ref: `prd.md > Shared appointment-booking journey`, `prd.md > Shared Scheduling and Appointment Booking`, `prd.md > States and Boundaries`
  Spec ref: `spec.md > LXNORO Booking API and SQLite Repository`, `spec.md > Booking Reminder Worker and Email Delivery`, `spec.md > Booking API contract (same-origin HTTPS)`, `spec.md > LXNORO-hosted booking database (SQLite)`, `spec.md > Important Failure Modes`
  Build: Add arbitrary-duration/day/time alternative proposals and requester response; perform transactional availability/conflict recheck at acceptance; persist reminder/retry jobs across restart; schedule same-day and 24-hour/every-three-hour owner notices while suppressing sleep/rest times; show pending count/requested times; implement SMTP idempotency and bounded retry; report failed delivery while preserving confirmed appointment; ensure stale/unsynced projection blocks confirmation until current sync/check succeeds.
  Verify (mechanical): `npm.cmd run typecheck`; `npm.cmd test` for alternative accept/reject, stale slot conflict, request state retention, sleep-window cadence, restart recovery, duplicate-job prevention, retry exhaustion, and confirmed-booking persistence after simulated SMTP failure; manually exercise one conflict and one successful alternative flow.
  Learner check: Request and reject an original slot, propose an unrelated time/duration, accept it, and verify confirmation only after the conflict check; inspect owner reminder and email-failure outcomes.
  Commit: `Complete booking alternatives and reminder lifecycle`

- [ ] **8. Offline, desktop/phone/watch layouts, and accessible localization are verified across the product**
  Becomes usable: Local plans and notes remain usable offline; online reopen/reconnect refreshes minimum booking state and synchronizes anonymous/coalesced busy intervals only; booking changes require connectivity and fresh server checks. Desktop, phone, and supported round/square watch browsers receive intentional layouts, with English LTR and Arabic RTL, keyboard/touch access, and reduced-motion behavior.
  Why now: The local core and booking behavior now exist; this slice verifies their boundaries and refines the other required viewports without changing the product into a scaled desktop layout.
  PRD ref: `prd.md > Responsive surfaces`, `prd.md > Time-matrix experience`, `prd.md > Profile and preferences`, `prd.md > Localization, privacy, offline behavior, and AI boundaries`, `prd.md > Micro-Bot reminders and platform behavior`
  Spec ref: `spec.md > Responsive Layout, Watch Surface, Accessibility, and Localization`, `spec.md > Owner Booking Console and Availability Projection`, `spec.md > Private browser database (Dexie/IndexedDB)`, `spec.md > Important Failure Modes`, `spec.md > Look and Feel`
  Build: Verify service-worker cache/update behavior and offline recovery; reconcile the interval-only outbox before owner booking actions; add explicit online/offline booking states; complete device-specific desktop/phone/round-watch/square-watch composition, localization/RTL audit, keyboard/touch access, contrast and reduced motion; document unsupported browser/device features honestly.
  Verify (mechanical): `npm.cmd run typecheck`; `npm.cmd test`; `npm.cmd run build`; verify stored local data survives reload/offline, queued interval sync contains only anonymous coalesced time ranges, booking mutations block offline, and online reconnect enables them after sync; inspect layouts at representative desktop, phone, round, and square viewport sizes and test Arabic direction.
  Learner check: Disconnect the network and edit local planning data; reconnect and inspect the booking sync state; then try the same core flow at phone and desktop sizes and switch to Arabic. If a physical/watch browser is unavailable, record that limitation rather than claiming device verification.
  Commit: `Verify offline boundaries and responsive localization`

- [ ] **9. Product hardening, documentation, and release readiness**
  Becomes usable: The actual responsive web foundation has a documented setup, tested production build, clear privacy/platform/integration behavior, and a deployment path verified against LXNORO hosting; the complete long-term feature set remains represented and no feature is substituted with a mock.
  Why now: Release preparation follows the integrated behavior, so documentation and deployment claims can reflect the code and services that were actually verified.
  PRD ref: `prd.md > What We're Building`, `prd.md > Full Product Scope Boundary`, `prd.md > Open Questions`, `prd.md > The Core Journey`
  Spec ref: `spec.md > Where It Runs and How Someone Tries It`, `spec.md > Stack`, `spec.md > External Services and Dependencies`, `spec.md > Important Failure Modes`, `spec.md > Decisions and Open Issues`
  Build: Complete maintainable setup/architecture/privacy/offline/localization/service/platform-limits documentation; verify security boundaries, input validation, secret exclusions, dependency licenses, browser error paths and production build; verify LXNORO HTTPS/Node/persistent-storage/SMTP deployment requirements before deploying; evaluate whether a concrete AI-assisted capability has demonstrated value and privacy fit, without adding a generic chatbot or making core features provider-dependent; keep the exact result and unresolved hosting constraints documented.
  Verify (mechanical): `npm.cmd run typecheck`; `npm.cmd test`; `npm.cmd run build`; follow the documented clean local setup; inspect `git status`, tracked/staged file lists and staged diff for credentials/private data/unrelated work; verify the deployed product only if authorized hosting access and all required services are available.
  Learner check: Follow the README to start the actual app, try the core journey and booking path, inspect the offline/privacy and platform-limit documentation, then report any failure or mismatch before final review.
  Commit: `Prepare LXNORO web platform for continued development`

## Hands-on Checkpoints

- [ ] Early usable behavior explored — after Slice 2, before the booking-boundary and broader time-model work; collect feedback on the local-first core while changes are still easy to incorporate.
- [ ] Final kick-the-tires exploration and feedback completed — after Slice 8, before final revisions/release readiness.

## Final Review

- [ ] Final review complete — feedback resolved and learner confirms ready to ship

## Code Tour and App Map

- [ ] Learning activity complete — focused plan-first/verification investigation using an actual architecture or integration decision from the build
- [ ] Optional edit and transfer reflection addressed — offered/declined/already covered/not applicable as appropriate
- [ ] `devpost/app-map.html` generated from finished code, checked, and shown, including a project-grounded practice to reuse

Activity and evidence: [record only what actually happened]
Route and stops: [record actual source paths and symbols]
Edit outcome: [tried/kept/reverted/declined/not applicable; verification if changed]
Reflection: [offered/answered/declined/already covered — personal answer belongs only in the ignored profile]
Activity mode: [live app and editor, focused alternative, prior practice, or recap]

## Revisions

- Inserted a privacy-safe booking projection integration slice after the local matrix and Micro-Bot core, before routines/horizon expansion, to validate the shared time-model/API boundary early as requested.
