---
doc: spec
status: approved
---

# Your friend LXNORO — Technical Spec

## How This Works, In Plain Language

The web app is a TypeScript React application. It draws LXNORO's time matrix, lets the user move between planning horizons, and keeps personal data in the browser's IndexedDB database through Dexie. Tasks, routines, notes, profile, preferences, and private schedule details do not sync to a cloud account. A service worker can cache the application shell so it opens offline after its first successful load. Whenever the app opens with internet available, it connects to the LXNORO booking service and refreshes only the minimum booking state and busy-interval projection needed for conflict protection. Local planning remains usable if that connection is unavailable.

A separate, small TypeScript server runs on LXNORO's existing hosting for shared booking only. It stores a narrow availability projection (busy time intervals, without activity names or reasons) and the booking records needed to receive requests, make owner decisions, prevent overlaps, remind the owner, and deliver confirmations. The public booking page receives available slots only. The server does not receive the user's full personal schedule or task notes. This is the product's one intentionally network-dependent feature; a requester and owner need internet access for it.

The same booking server can act as a weather proxy after the user grants browser location access. It forwards rounded coordinates to MET Norway's public forecast endpoint, caches the result, and does not store the user's schedule or location history. Weather remains optional. Email uses an SMTP relay operated or authorized by LXNORO, not a selected mail SaaS. Browser reminders work best while the app is open; a normal web page cannot guarantee exact local reminders after its browser is suspended. The product states this limit and keeps the saved plan usable.

The architecture keeps the time model and product logic independent from React, browser notifications, booking transport, weather, and email. Those boundaries let the web app grow and allow a later native mobile client without rewriting the scheduling rules.

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`.

### Personal time-planning journey

1. The user opens the React app. The time-matrix view reads the selected horizon and the current time, loads local profile/preferences and scheduled activities from Dexie, and marks “Now” on an initially empty grid. Editable starter activities are shown beside the grid; they do not enter the schedule until selected and scheduled.
2. The user creates or edits an activity. A form validates the title, emoji/symbol, local date and time, duration, recurrence, notes, alert preference, and status. The scheduling domain converts this into the shared activity/task model, then a Dexie transaction saves it locally. Horizon views derive their cells from that same model rather than maintaining separate calendars.
3. The reminder scheduler evaluates due instances while the app is active. The delivery adapter uses an in-app prompt and, when permission is granted and supported, a browser notification, sound, or vibration. The prompt reads the complete note from local storage. On returning from background, the app recalculates due and missed items instead of trusting an old timer.
4. If weather is enabled, the user explicitly grants location access. The client sends only rounded coordinates to the LXNORO weather proxy; the proxy requests a forecast, caches according to response headers, and returns a small normalized weather summary. No task title, note, routine, or reminder content is sent.

### Shared appointment-booking journey

1. The owner signs in to the booking area and creates/configures a link. Availability rules, time zone, duration options, notice windows, buffers, expiry, and link state are stored by the LXNORO booking server. The local app publishes only the busy intervals needed for the link's configured horizon; the server never receives private activity labels or notes.
2. The requester opens the public link. The server checks availability rules, busy intervals, active booking claims, and confirmed appointments, then returns open slots only. The client formats them in both the booking time zone and requester's selected IANA time zone.
3. The requester submits their name, email, optional note, slot, duration, and time zone. In a serialized SQLite transaction, the server rechecks the slot and creates a Pending request. It does not confirm automatically. The owner sees the request in the private booking area and receives configured notifications.
4. A durable server worker checks due reminder and email-retry records after startup and periodically while running. It sends owner reminders on the specified cadence while respecting configured sleep/rest windows. Mail attempts use the configured LXNORO SMTP relay; outcomes and retries are recorded separately from appointment confirmation.
5. On owner approval, the server rechecks the slot inside the same transaction that records confirmation. If the slot is no longer valid, approval is blocked and the request stays available for an explicit owner decision. If valid, the booking is confirmed and added to a local schedule projection; email is attempted afterward. Delivery failure cannot roll back the appointment.
6. An alternative proposal is stored as a pending offer. Requester acceptance triggers a fresh serialized conflict check. The server confirms and adds the appointment only if the check passes. Otherwise it blocks confirmation, informs the requester, and returns the request to owner action. Rejection closes the request without creating an appointment.

**Availability refresh and booking gate:** On app open/load while connected, and again when connectivity returns, the owner client refreshes booking state and sends only the minimum busy-interval changes required by active booking links. Offline edits remain local and are queued as interval-only projection updates; private task details never enter the queue. Booking mutations (request submission, owner approval/rejection, alternative proposal, alternative acceptance, and final confirmation) require connectivity. Before enabling an owner mutation, the client must finish its pending projection sync; the server then rechecks the latest stored intervals, availability rules, claims, and appointments inside the same transaction that changes booking state. Requester actions and final confirmations also require a successful server-side conflict check. If a required sync/check cannot complete, the operation remains unconfirmed and the UI explains that booking needs a connection; local planning continues normally. This rule resolves the offline workflow: offline use does not disable local planning, while booking changes wait for current booking state and an online conflict check.

## Stack

| Area | Choice | Rationale and tradeoff |
|---|---|---|
| Language | TypeScript, strict mode | Typed domain models and API contracts across browser and server; runtime validation is still required for stored/imported/network data. |
| Web UI | React with Vite | A lightweight responsive web foundation that runs on the inspected Node/npm environment, supports a modular component system, and builds static assets for LXNORO's domain. It is not a native mobile application. |
| Styling | Native CSS, CSS variables, grid/flex layouts | Keeps the time matrix and round/square responsive layouts original and dependency-light; glass effects remain restrained and can be disabled/reduced. |
| Local persistence | IndexedDB through Dexie | Persistent structured browser storage with indexes and transactions for local-first schedules and substantial notes. Browser storage remains subject to browser eviction/device loss and is not automatically encrypted by the application. |
| Client routing/state | React Router; local React state and Dexie queries | Routes separate matrix, preferences, and booking surfaces. Domain services own behavior; React owns presentation and transient form/navigation state. Avoids a global state framework for a single-user local app. |
| Validation | Zod at form, import, and API boundaries | Rejects malformed user-entered and remote values before they enter domain/storage logic. |
| Time-zone operations | `@js-temporal/polyfill` and IANA time-zone IDs | Keeps wall-clock recurrence separate from UTC instants and handles DST-sensitive booking conversions. The polyfill adds a dependency but avoids relying on uneven browser `Temporal` support. |
| Booking/API server | Node.js + Fastify, TypeScript | A modular, low-overhead server for the public link and private owner APIs. Same language as the client; its runtime and persistent-storage support on LXNORO hosting must be verified before deployment. |
| Booking persistence | SQLite through `better-sqlite3` | A small, self-hostable transactional store suited to one LXNORO booking service and no SaaS database. A repository boundary keeps storage replaceable if verified hosting constraints or load later require another LXNORO-managed database. |
| App-shell offline behavior | Web App Manifest + small custom service worker | Caches built static assets and provides an installable web experience where supported without introducing a large PWA plugin. It does not make server booking or reliable closed-app alarms available offline. |
| Email | Nodemailer SMTP adapter connected only to an LXNORO-authorized relay | Avoids binding the product to Resend or another SaaS. The actual SMTP host, sender authorization, delivery limits, and credentials are not present in the inspected project and must be supplied by LXNORO before email deployment. |
| Weather | MET Norway Locationforecast 2.0 through the LXNORO proxy | Public global point forecast, commercial use of the data allowed under its stated open-data licenses, no subscription fee or SLA. Requires attribution, an identifying User-Agent, caching/rate discipline, and permission before location access. |
| AI | No provider in this architecture | The core remains usable without AI; no specific AI capability has yet passed the product's privacy/value test. A provider-neutral interface can be added when a concrete benefit and data boundary are approved. |

Environment inspected: no application source, manifest, or installed application stack exists yet. Node `v26.2.0` and npm `11.13.0` are available via `npm.cmd`; no dependencies have been installed for this project. Local development tooling is not evidence that LXNORO hosting supports the proposed server runtime or persistent SQLite files.

Major documentation: [Vite guide](https://vite.dev/guide/), [React + TypeScript](https://react.dev/learn/typescript), [Dexie documentation](https://dexie.org/docs/), [Fastify documentation](https://fastify.dev/docs/latest/), [better-sqlite3 transactions](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transactionfunction---transaction), [Temporal polyfill](https://github.com/js-temporal/temporal-polyfill), [Nodemailer SMTP](https://nodemailer.com/smtp), [MET Locationforecast](https://api.met.no/weatherapi/locationforecast/2.0/documentation), [MET Terms of Service](https://api.met.no/doc/TermsOfService), [MET licensing](https://docs.api.met.no/doc/License.html), [Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API), [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).

## Where It Runs and How Someone Tries It

### Local development and demonstration

- Prerequisites: Node.js (current inspected environment is v26.2.0) and npm (`npm.cmd` works in this PowerShell environment). The app will target a maintained Node LTS supported by Vite/Fastify; local Node compatibility is not the same as production-host compatibility.
- After the build phase creates the app and dependencies are installed, start the API/server with `npm.cmd run dev:server` and the web client with `npm.cmd run dev:web` in two PowerShell terminals. Open `http://127.0.0.1:5173/` for the app. These script names and ports are the planned contract and must be aligned with `package.json` during implementation.
- Local planning, time navigation, notes, and starter activities should work without an account or network. Booking requires the local booking server; actual confirmation email requires the authorized SMTP configuration. Weather requires internet access and explicit geolocation permission. The phone-sized responsive view is the primary demonstration viewport; use a real browser/device check for permission and notification behavior.
- The Devpost submission still requires a short demonstration video and public source repository. Local recording is sufficient; public deployment does not replace either.

### Deployment

The target is LXNORO's existing domain and hosting, as directed. Deployment requires HTTPS, a supported persistent Node.js process, durable writable storage for the SQLite database, backups, a process restart policy, and access to an authorized SMTP relay. **The specific hosting product/runtime, database persistence semantics, mail relay, DNS routing, and deployment credentials were not present in this project and have not been verified.** Verify these capabilities before choosing deployment-specific commands or promising public booking/email availability. No paid SaaS is selected or required by this design.

The responsive web platform is the current application. A later Google Play mobile app and smartwatch experience remain product evolution goals; a native app is not built in this web phase. Domain logic stays separate from browser adapters to support a future native client.

## Look and Feel

PRD ref: `prd.md > Look and Feel`, `prd.md > Screens and Layout`.

Use a black/dark base, restrained pastel-purple accents, translucent layered panels, expressive emoji/symbol-plus-label activity blocks, compact status indicators, and smooth but brief transitions. Build the original LXNORO time matrix with CSS grid and semantic controls: horizontal time, vertical activity/category rows, actual duration blocks, current-time marker, and immediately legible Now/Next. Do not copy Google Workspace UI. Desktop can show more rows and horizons; phone reorganizes the matrix into a touch-first time strip; round/square watch layouts use a dedicated concise current/next composition rather than a shrunken desktop screen.

Use a highly readable sans-serif system stack initially; exact font can be selected in implementation. Centralize colors, spacing, motion, typography, and focus tokens in CSS variables. Keep blur and layered transparency limited to static surfaces, provide a solid-surface fallback, respect `prefers-reduced-motion`, and test contrast, keyboard focus, screen-reader labels, touch targets, overflow, and narrow round/square viewports.

Localization uses centralized English and Arabic dictionaries, `lang` and `dir` at the document root, Intl date/time formatting with the selected locale and time zone, and logical CSS properties (`inline-start/end`) so RTL does not require duplicated layout. Emoji/symbol direction remains unchanged; directional navigation glyphs may mirror. Notifications and booking email templates use the same language-aware message catalog where appropriate.

## Components

### Time Matrix and Horizon Navigation

Renders daily, weekly, monthly, yearly, and five-year horizons from one schedule query/domain representation. Daily is the first-use horizon with a structured empty grid, current time, time scale, Now marker, visible starter foundations, and a clear create action. Coarser horizons aggregate the same records at lower detail. Confirmed shared appointments appear in this matrix through a minimal local booking projection. Implements `prd.md > Time-matrix experience`, `prd.md > Time horizons and shared schedule model`, and `prd.md > Starter activities, routines, tasks, and custom activities`.

### Activity, Routine, Task, and Starter Editor

Edits common starter templates, user-created activity types, routines, and tasks in the same scheduling model. A starter remains a template until explicitly scheduled; editing/removing it never fabricates user history. Forms support symbol/title, date/time, duration, recurrence/count, alert, notes, and completion as applicable. Implements `prd.md > Starter activities, routines, tasks, and custom activities`.

### Notes Editor and Activity Detail

Shows compact notes until focus, expands for editing, saves the full text (up to the approximately 1,000-word product target), then collapses. Task detail and reminder interactions read the complete note. Render user text as text, never unsanitized HTML. Implements `prd.md > Notes`.

### Scheduling and Recurrence Domain

Framework-independent functions validate activity records, expand recurrence within a requested horizon, calculate next/upcoming instances, preserve local wall-clock intent and IANA zone, and identify overlaps. Store recurrence rule fields (frequency, interval, selected weekdays, optional end date/count) rather than duplicating generated occurrences. Each view queries a bounded date range to keep larger datasets responsive. Implements `prd.md > Time horizons and shared schedule model` and `prd.md > Starter activities, routines, tasks, and custom activities`.

### Local Repository and Preferences

Dexie repositories isolate IndexedDB schema/migrations, task/routine/note/profile/preference tables, transactions, and data access from UI. Local data includes country/city labels, user locale, chosen time zone, sleep/rest windows, and notification preferences. No private schedule content is uploaded for synchronization. IndexedDB durability and quotas vary by browser; the product should surface storage errors and later support a user-controlled backup/export path. Implements `prd.md > Profile and preferences` and `prd.md > Localization, privacy, offline behavior, and AI boundaries`.

### Reminder Scheduler and Delivery Adapters

Domain scheduling computes due instances; a local coordinator arms foreground timers and recomputes on app focus, visibility change, and reload. A delivery interface chooses in-app prompt and supported browser Notification API, audio, or vibration adapters. Permission denial/unsupported features degrade independently. User gesture is used to enable audio; haptics use supported vibration APIs only. Do not infer OS silent mode. Ordinary JS timers are not treated as reliable in suspended tabs; no user task/note is uploaded to enable push reminders. Implements `prd.md > Micro-Bot reminders and platform behavior`.

### Responsive Layout, Watch Surface, Accessibility, and Localization

Owns viewport-specific composition, round/square watch media queries, keyboard/touch affordances, reduced motion, accessible naming, translation dictionaries, RTL/LTR direction, locale-formatted dates/times, and direction-aware icon treatment. Browser support and actual watch devices remain verification targets. Implements `prd.md > Responsive surfaces`, `prd.md > Time-matrix experience`, `prd.md > Profile and preferences`, and `prd.md > Localization, privacy, offline behavior, and AI boundaries`.

### Weather Context Adapter

Requests browser geolocation only after the user chooses to enable weather and grants permission. The adapter forwards rounded coordinates to the same-origin LXNORO endpoint; server calls MET Norway's Locationforecast 2.0, honors response cache headers, stores only a short-lived forecast cache, and returns a small normalized forecast with provider attribution. It sends no task/schedule text. Denial, no coordinates, offline state, unsupported geolocation, quota throttling, or provider failure hides weather without affecting planning. Implements `prd.md > Weather and contextual information`.

### Booking Link and Requester Page

Serves opaque, revocable links and public availability/request APIs. The public response schema contains only open slot start/end, duration, booking-zone and requester-zone representations, and link display details intentionally made public. It never returns a busy interval or a private reason. Request inputs are validated, rate-limited, and protected from duplicate submissions. Implements `prd.md > Shared Scheduling and Appointment Booking` and `prd.md > Booking surfaces`.

### Owner Booking Console and Availability Projection

Provides owner sign-in, availability rules, link controls, pending request queue, conflict state, explicit approval/rejection, and alternative proposals for any day/time/duration. On app open and reconnect, a sync coordinator refreshes server booking state and uploads only the interval projection required for active booking windows and confirmed appointments. Offline interval changes are queued locally without titles, notes, routine names, private categories, or reasons; owner booking controls remain unavailable until the queue is synchronized. Implements `prd.md > Shared Scheduling and Appointment Booking` and `prd.md > Booking surfaces`.

### LXNORO Booking API and SQLite Repository

Owns link tokens, owner-only rules, minimum booking records, time-zone conversion, request state transitions, availability/conflict checks, idempotency, and booking/email audit status. Public and owner routes have distinct authorization. Each request, approval, alternative acceptance, and final confirmation rechecks the current server-side interval projection and active booking records. SQLite overlap checks and inserts run in a short `BEGIN IMMEDIATE` transaction; no network/email call is awaited inside the transaction. Passwords are stored using a modern adaptive password hash, owner sessions use secure HttpOnly/SameSite cookies over HTTPS, public endpoints are rate-limited, link tokens are high entropy and only their hashes are stored, and service secrets remain in the LXNORO host's secret/environment configuration. Implements `prd.md > Shared Scheduling and Appointment Booking`.

### Booking Reminder Worker and Email Delivery

Persists next reminder and retry times so restart does not erase work; at process start and on a short interval, it claims due records, excludes owner sleep/rest windows, sends the same-day and 24-hour/every-three-hour reminders before requested time, and deduplicates each cadence event. Confirmation state is committed before email is queued. SMTP failures produce a durable failure state, safe exponential retry with a cap, and owner notice; appointment confirmation remains intact. A single worker process/SQLite file is assumed; multi-instance hosting would need a verified coordination mechanism. Implements `prd.md > Shared Scheduling and Appointment Booking`.

### Optional AI Adapter Boundary

No AI model, remote provider, or model dependency is selected. If a concrete feature (for example, natural language to a proposed structured activity) is later approved, place it behind an interface that receives only the user-approved input, previews structured output for confirmation, and cannot write directly to the schedule or decide booking actions. Core scheduling and reminders never depend on AI. Implements `prd.md > Localization, privacy, offline behavior, and AI boundaries`.

## Data Model

### Private browser database (Dexie/IndexedDB)

| Record | Main fields | Persistence and updates |
|---|---|---|
| `ActivityType` | `id`, `label`, `symbol`, `isStarter`, `archivedAt?` | Starter templates and custom types. A type is not a scheduled event. |
| `Activity` | `id`, `typeId`, `title`, `symbolOverride?`, `startLocal`, `timeZone`, `durationMinutes`, `recurrence?`, `alertEnabled`, `notes`, `status`, `source` | One extensible scheduled task/routine occurrence definition. Completion is state, not deletion. Notes stay local. |
| `RecurrenceRule` | `frequency`, `interval`, `weekdays?`, `count?`, `untilLocal?` | Embedded rule referenced by the activity; instances are calculated per visible range. |
| `BookingProjection` | `bookingId`, `startInstant`, `endInstant`, `status`, `displayLabel` | Minimal local representation of confirmed/pending booking status needed to show it in planning. No requester note needs to be copied into the private schedule. |
| `Profile` | `country`, `city`, optional chosen coordinates, `timeZone` | Local personal context. Geolocation is not retained unless the user chooses the location for weather. |
| `Preferences` | `locale`, `sleepRestWindows`, reminder channel preferences, reduced-motion preference | Local settings. |
| `WeatherCache` | rounded coordinates key, normalized forecast, fetched/expiry times, attribution | Short-lived cache only; clearable and never a schedule record. |
| `ReminderLedger` | activity occurrence key, due instant, last presented/dismissed state | Prevents duplicate in-app reminders and allows catch-up after returning. No guarantee of delivery while suspended. |
| `BookingSyncOutbox` | coalesced busy interval start/end instants, projection revision, sync status | Stores only the minimum anonymous time ranges needed for booking conflict protection, queued during offline planning. No task/event IDs, source IDs, titles, notes, reasons, categories, or full schedule. Clear/mark synced after server acknowledgement. |

Use stable IDs and indexed date/status/type fields. Schema changes use Dexie version migrations. The app uses transactions when an activity, recurrence, or related reminder state changes. User-facing data can be sensitive: it remains in the local browser profile and is not encrypted by Dexie; the device/browser account and OS are part of its security boundary. Browser eviction/device loss is a real risk; do not claim cloud backup or cross-device sync.

### LXNORO-hosted booking database (SQLite)

| Record | Minimum stored fields | Reason |
|---|---|---|
| `Owner` | owner ID, password hash or configured credential verifier, notification email/preferences, owner time zone, sleep/rest window | Secure owner access and reminder delivery. No personal task data. |
| `BookingLink` | owner ID, token hash, enabled/expiry, duration options, weekday/time windows, min/max notice, buffers, booking time zone | Public link and rule evaluation. |
| `BusyInterval` | owner ID, start/end instants, source revision, updated-at | Conflict checking only. Refreshed when the app opens online and when connectivity returns; offline interval-only updates wait in the local outbox. Never includes event title, note, category, or reason. |
| `BookingRequest` | opaque ID, link ID, requester full name/email/optional message, requested start/end/duration, requester zone, status, timestamps | Pending review and required requester communications. |
| `AlternativeProposal` | request ID, start/end/duration, owner zone, requester response, status | Manual alternatives and acceptance recheck. |
| `ConfirmedAppointment` | request ID, start/end/duration, relevant owner-authored appointment details, confirmation state | Confirmed shared booking integrated with planning/reminders. Store no private task notes. |
| `DeliveryJob` | related record ID, channel, template data needed, due time, attempts, last error category, dedupe key | Durable owner/requester notifications and safe email retry. Do not log message bodies, passwords, tokens, or raw SMTP credentials. |

Delete or retain requester records only under a documented retention policy to be set before public launch; no retention duration is invented here. Requester data is necessary to manage and confirm a booking, but does not enter the private local task database except for a minimal confirmed-appointment projection.

### Booking API contract (same-origin HTTPS)

- `GET /api/public/booking/:token/availability?from=<ISO-8601>&to=<ISO-8601>&timeZone=<IANA>` → `{ timeZone, slots: [{ start, end, durationMinutes, requesterLocalStart, requesterLocalEnd }] }`. Contains only bookable slots, never blocked time or block reasons.
- `POST /api/public/booking/:token/requests` JSON `{ fullName, email, message?, start, durationMinutes, requesterTimeZone, idempotencyKey }` → `201 { requestId, status: "pending" }`; `409 { code: "slot_unavailable" }` when recheck fails. Never returns private schedule data.
- `POST /api/public/booking/:token/requests/:id/alternative-response` JSON `{ decision: "accept" | "reject", idempotencyKey }` → accepted/closed result, or `409 { code: "slot_unavailable", status: "owner_action_required" }`. Every accept rechecks inside the write transaction.
- Owner routes under `/api/owner/*` require an authenticated secure session: configure link/rules, publish busy intervals, list requests, approve/reject, create alternatives, and read delivery status. Mutations return explicit state and conflict results. Owner approval/alternative routes do not expose task notes to the public page.
- All date/time instants cross the API as ISO-8601 UTC instants with a separate IANA zone for display and recurrence intent. Validate duration, advance windows, link state, status transitions, CSRF/session, and payload size server-side as well as client-side.

## File Structure

Planned structure only; these files do not exist yet except the Devpost planning documents.

```text
project/
├── index.html                    # Web entry point and metadata
├── package.json                  # scripts and intentional dependencies
├── vite.config.ts                # client dev/build configuration
├── tsconfig*.json                # strict client/server TypeScript configs
├── public/
│   ├── manifest.webmanifest      # install metadata
│   ├── icons/                    # original LXNORO app icons
│   └── sw.js                     # app-shell cache and notification click routing
├── src/
│   ├── app/                      # routes, app shell, error boundaries
│   ├── features/
│   │   ├── matrix/               # horizon grid, Now/Next, responsive rendering
│   │   ├── activities/           # starters, routines, tasks, editors
│   │   ├── notes/                # expandable note editor/detail
│   │   ├── reminders/            # due-instance coordinator and delivery ports
│   │   ├── booking/              # owner console, requester link, API client
│   │   ├── weather/              # consent and normalized context UI
│   │   └── preferences/          # profile, language, notification/rest settings
│   ├── domain/
│   │   ├── time/                 # horizon ranges, recurrence, timezone conversion
│   │   ├── activities/           # typed entities, validation, completion rules
│   │   └── booking/              # client-side contract types and status labels
│   ├── storage/                  # Dexie database, migrations, repositories
│   ├── i18n/                     # English/Arabic dictionaries, direction/formatting
│   ├── platform/                 # notifications, vibration, geolocation, online state
│   └── styles/                   # tokens, RTL-safe base, matrix and viewport styles
├── server/
│   ├── app.ts                    # Fastify construction and same-origin routes
│   ├── routes/                   # public booking, owner, weather endpoints
│   ├── domain/                   # booking rules, time zones, conflict transitions
│   ├── db/                       # SQLite schema, migrations, repositories
│   ├── workers/                  # persisted reminder and mail retry scheduler
│   ├── delivery/                 # SMTP adapter and localized message templates
│   ├── weather/                  # MET Norway client/cache/normalizer
│   └── security/                 # sessions, password hashing, rate limits, CSRF
├── tests/                        # domain, storage, API contract and browser-flow tests
├── devpost/                      # scope, PRD, spec and competition materials
└── README.md                     # setup, privacy, architecture and integrations
```

## External Services and Dependencies

### LXNORO booking host

This is first-party infrastructure, not a third-party SaaS. It must provide HTTPS, a persistent Node.js process, durable writable SQLite path, backups, restart behavior, and configured mail relay access. Exact provider/runtime, quotas, operating system, and deployment paths are unknown because no hosting configuration is present in the project. No deployment assumption is considered verified.

### MET Norway Locationforecast

- Endpoint: `GET https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={latitude}&lon={longitude}` from the LXNORO server only.
- Authentication: no API key stated by the official service; include a valid identifying `User-Agent` with app/domain and contact path. Use HTTPS, read `Expires`/`Last-Modified`, conditional cache requests, and keep coordinates to no more than four decimal places. Respect the provider's application-wide 20 requests/second ceiling and avoid polling while the app is not in use.
- Data: public forecast response; normalize only condition, precipitation, temperature, forecast time, and attribution needed by the UI. Forecast may be unavailable or stale; show timestamp and graceful unavailable status.
- Commercial/data terms: MET Norway states Locationforecast is global and its open data permits commercial use; attribution is required under CC BY 4.0/NLOD. There is no delivery guarantee/SLA. The API terms say direct browser access exposes requester IP and geocoordinates in provider logs and recommend a proxy; the LXNORO proxy avoids exposing each user's IP to MET, but the chosen coordinates still reach MET. User permission precedes retrieval. [Product catalog](https://api.met.no/), [terms](https://api.met.no/doc/TermsOfService), [license](https://docs.api.met.no/doc/License.html).
- Cost: public service with no subscription price; no SLA. Do not promise availability. No third-party SaaS account or key is planned.

### LXNORO SMTP relay

Use SMTP/TLS configured through server environment values (for example `LX_MAIL_HOST`, `LX_MAIL_PORT`, `LX_MAIL_USER`, `LX_MAIL_PASSWORD`, `LX_MAIL_FROM`); actual names and credentials must be set during host integration. Nodemailer uses standard SMTP and supports TLS/STARTTLS. No Resend or other SaaS provider is selected. Emails are sent only for booking confirmation and configured owner alerts. The implementation must support delivery status, idempotent retry, and safe message templates. [Nodemailer SMTP documentation](https://nodemailer.com/smtp).

### Browser/device APIs

Notifications require a secure context and user permission; service worker display and Web App Manifest support depend on browser/platform. Vibration, audio, geolocation, background execution, and watch-browser support vary. No OS silent-mode detector is assumed. No external AI API, SaaS database, hosted authentication product, analytics tracker, or cloud sync is part of this architecture.

## Important Failure Modes

- **Browser closes/suspends before a local task reminder fires** → On next app open, recalculate and show due/missed items with their full notes. Clearly state that exact closed-app delivery is not guaranteed by this web platform; do not upload private tasks to enable push.
- **Weather permission/provider/network unavailable** → Hide weather context, retain last valid cache only with its timestamp, and keep all local planning usable. Never invent conditions.
- **Booking host, mail relay, stale availability projection, or DB is unavailable** → Keep local planning available. Keep booking mutations unavailable until connectivity and the interval-only projection sync are current; do not confirm without a successful conflict transaction. Keep request/delivery status explicit and retry mail without rolling back an appointment.
- **Browser storage quota/eviction or migration failure** → Show actionable storage error, avoid claiming a save succeeded, retain in-memory edit state where possible, and offer recovery/export after the export design is implemented.
- **Permission denied/unsupported haptic/audio/watch/browser feature** → Continue with the strongest supported in-app visual interaction and explain the unavailable channel without blocking the task flow.

## What Was Simplified and Why

- Current platform is a responsive web application. Native Android/mobile distribution and dedicated smartwatch clients are later product evolution; the present responsive system still includes phone, desktop, and supported watch-browser layouts. This is an implementation sequence, not a reduction of product scope.
- Core personal data has no account/cloud sync. Only a narrow busy-interval projection and the minimum booking request/confirmation/reminder state live on LXNORO's host so the explicitly network-dependent shared booking feature can operate.
- No paid SaaS backend, weather subscription, email SaaS, analytics, or AI service is added. Weather uses an optional public open-data API through an LXNORO proxy. The email adapter depends on existing LXNORO-authorized SMTP infrastructure.
- No product capability is cut from the complete product definition. The hackathon phone-view journey sets demonstration order only; it does not redefine the complete long-term scope.

## Decisions and Open Issues

### Decisions carried into this draft

- **Learner decision:** Free/current edition is strictly local-first for private personal data; no private schedule, task name, note, setting, or context sync.
- **Learner decision:** Shared booking is the only narrow network-dependent product feature and runs on LXNORO-hosted infrastructure, with minimum booking state only.
- **Learner decision:** Weather is optional and permission-based; if location/access is unavailable or refused, weather is disabled without affecting planning.
- **Learner decision:** Existing LXNORO domain/hosting is the deployment target; later paid editions may introduce LXNORO-managed cloud/local-server infrastructure, but the free version is not designed around it.
- **Stack selected under delegated choice:** TypeScript/React/Vite, Dexie/IndexedDB, and a self-hosted TypeScript/Fastify/SQLite booking service, with SMTP adapter and MET Norway weather adapter. Deployment compatibility remains unverified.
- **Learner decision:** When the app opens online, refresh minimum booking state and busy intervals. Keep local planning usable offline; require connectivity, interval-projection synchronization, and a current server-side conflict transaction for booking mutations and confirmation. Offline outbox entries contain intervals only.
- **Useful uncertainty:** No learner-specific technical uncertainty was identified. The key investigation is operational: verify that LXNORO hosting can run the Node service with durable SQLite storage and authorized SMTP before implementation/deployment depends on it.

### Deployment and integration checks

- Inspect only LXNORO's authorized hosting configuration before implementation to verify Node support, persistent disk, process restart, HTTPS/domain routing, backup approach, and SMTP relay authorization. If any are absent, revise the hosting adapter with the owner rather than silently adopting paid SaaS.
- Validate public MET endpoint coverage/response for the selected location, attribution display, cache behavior, and whether the host proxy satisfies the provider's User-Agent and traffic rules.
- Choose a booking-data retention duration and owner authentication enrollment/reset flow before public booking release; neither duration nor host-specific identity mechanism was specified in the approved PRD.
- Confirm target browsers/watch browsers during build verification. Responsive layouts can be implemented universally, but notifications, vibration, background execution, and round-watch browser availability are platform-dependent.
- No AI feature/provider has been approved. Reassess only when a concrete privacy-preserving benefit is identified; never make core operation provider-dependent.
