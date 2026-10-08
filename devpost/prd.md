---
doc: prd
status: draft
---

# Your friend LXNORO — Product Requirements

One line: **Your friend LXNORO** is a lightweight personal digital companion and Micro-Bot Time Engine for individuals who want one coherent system for their time, routines, tasks, notes, reminders, shared appointments, contextual information, and plans from today through five years.

Source: `scope.md > The Unique Kernel`, `Who It's For`, `The Core Loop`, `Complete Product Scope`, `Shared Scheduling and Appointment Booking`, `Hackathon Implementation and Demo Priority`, and `The POC Boundary`.

## The Core Journey

### Personal time-planning journey

1. **Open the time matrix.** The user sees the current date and time, the current horizon (the current day on first use), a horizontal time scale, and a clear “Now” position. Activities and routines occupy time-and-duration blocks in rows/categories. “Now” and “Next” are immediately identifiable. The user can move between daily, weekly, monthly, yearly, and five-year views without losing their selected context.
2. **Start from a useful foundation or create an activity.** On first use, an empty but structured grid is visible alongside common editable starter activities. Starter activities are not fabricated history or scheduled events; they appear in the grid only after the user explicitly schedules/activates them. The user can configure a starter or create a task, routine, or custom activity with their own emoji/symbol and text label.
3. **Plan and update.** The user assigns the activity a date, time, duration, recurrence/repeat count, alert preference, and notes as applicable. They can review, edit, complete, postpone, or otherwise update it. Selecting an activity opens its details, including its full saved note and relevant context. Confirmed appointments appear in this same time structure.
4. **Get the right information at the relevant time.** Weather/context appears unobtrusively when available. When a task becomes due, the Micro-Bot presents the task title, full saved notes, and relevant context through supported in-app, popup, or notification behavior, with sound and/or haptics only when supported and appropriate. The user completes or updates the activity and the schedule reflects that change.
5. **Return and understand continuity.** The user can see what is relevant now and next and understand how current actions fit their longer plans. Their saved local data and notes remain available on return and during offline use where supported.

### Shared appointment-booking journey

1. The owner configures booking availability and rules, then creates a shareable booking link that remains active until disabled or expired.
2. A requester opens the link and sees only genuinely available slots in the booking time zone, clearly converted to the requester's local time when different. They choose a day, available time, and allowed duration, and provide full name, email address, and an optional short message.
3. Submission creates a **Pending** request. It is never automatically confirmed. The owner receives a notification on the request's creation day. If it remains Pending, LXNORO sends time-aware reminders beginning 24 hours before the requested time and repeating every three hours, except during the owner's configured sleep/rest period. Notifications show the pending count and relevant requested appointment times when there are multiple requests.
4. The owner reviews the request. If its slot is still available and conflict-free, the owner can explicitly approve or reject it. Approval immediately confirms and adds the appointment to the owner's schedule and planning/reminder system; rejection does not confirm or schedule the requested appointment.
5. After approval, LXNORO attempts to email the requester at the supplied address. The message addresses the requester by their supplied name and contains the confirmed appointment date, time, duration, and relevant details. Email delivery failure is recorded and retried safely, and the owner is notified; it never cancels or rolls back the appointment.
6. Instead of approving the requested time, the owner may reject that request and manually propose an alternative on any suitable day, at any suitable time, and for any suitable duration. The requester must accept or reject the proposal. Acceptance triggers a fresh availability/conflict check: if available, the appointment is confirmed, added to the schedule, and confirmation email is attempted; if unavailable, confirmation is blocked, the requester is told the time is no longer available, and the request returns to the owner to propose another alternative. Rejection creates no appointment; the request is closed/rejected, and the owner may send another alternative later.

## Screens and Layout

### Time-matrix experience

The time matrix is the primary product surface, not a conventional vertically stacked dashboard. Time and temporal progression run horizontally; activities, routines, tasks, and relevant personal categories run vertically. Activity blocks reflect their actual time and duration. The current time is visibly marked, and “Now” and “Next” can be understood at a glance. Selecting an activity opens its details, including editable properties, expandable notes, and relevant context. Weather remains lightweight and associated with relevant time/activity.

The same underlying matrix concept supports daily, weekly, monthly, yearly, and five-year horizons, changing detail to suit the selected horizon. Navigation preserves the user's context. On first use, the current day is selected and the actual schedule grid is empty. Common starter activities are directly visible as editable foundations outside the scheduled grid, alongside a clear primary action to add the first activity, routine, or task. The interface explains how to schedule them without a tutorial or separate library step. It shows no sample appointments, fake tasks, or fabricated activity history.

Activities are represented by an intuitive emoji/symbol plus a short text label. These communicate meaning, rather than serving only as decoration. User-created symbols and labels remain consistent in the grid and relevant activity/reminder views.

### Responsive surfaces

- **Desktop/laptop:** efficient access to horizons, the time matrix, activities, notes, reminder/context status, and controls.
- **Phone:** touch-friendly time-matrix reorganization, readable current/next activities, quick creation/editing, compact navigation, and usable reminder details.
- **Smartwatch:** dedicated concise experience for supported round and square displays, prioritizing current/next activity, essential time, reminder status, and quick actions. It is not a scaled-down desktop layout.

The hackathon demonstration is centered on a phone-sized view of the actual responsive web platform. Desktop/laptop and smartwatch experiences remain part of the complete product requirements.

### Booking surfaces

The owner needs an in-product way to define booking rules, create/disable/expire shareable links, review Pending requests, see time-aware reminders and conflicts, and explicitly approve, reject, or propose an alternative. The requester uses a shareable booking page to enter required details, see available slots, request a booking, and accept/reject an alternative. The booking page exposes availability only; it never exposes private calendar/task/note data or the reason a slot is unavailable.

### Profile and preferences

The product provides a clear language selector, country/city profile, and relevant notification and sleep/rest preferences. These controls support the requirements above without turning first use into an onboarding-heavy flow.

## Look and Feel

Use a modern, premium, futuristic and gaming-inspired visual language (not a game): dark base surfaces, pastel-purple accents, restrained translucent/glass-like layers, expressive symbols, compact status indicators, and polished, lightweight transitions. The time matrix should make time, duration, current position, and upcoming actions clear at a glance. Use a highly readable modern sans-serif typeface; select the exact font during implementation. Preserve readable contrast, clear hierarchy, touch targets, keyboard usability where applicable, and reduced-motion behavior where practical. Keep effects restrained for performance on modest hardware and mobile devices. The user referenced Google Workspace-style grid clarity as inspiration for organization only; the LXNORO visual design must be original and must not copy its UI.

English uses LTR layout and English interface/date/time/reminder text. Arabic uses RTL layout and Arabic interface/date/time/reminder text, including correct alignment and directional treatment across grids, forms, activity details, navigation, and notifications. User-facing strings are centrally localizable rather than hard-coded throughout views.

## Features and Behavior

### Time horizons and shared schedule model

Source: `scope.md > The Core Loop` and `Complete Product Scope`.

The product supports daily, weekly, monthly, yearly, and five-year horizons over a coherent time model connecting date, time, duration, recurrence, routine/activity, task, completion state, and reminder state. Moving between horizons preserves context and lets the user relate high-level plans to concrete activities. The time matrix adapts the detail level to the selected horizon. Tasks, routines, and confirmed shared appointments use the same understandable time structure.

- [ ] The user can navigate all five horizons and see activities positioned at their actual dates/times without losing context when changing views.
- [ ] “Now,” “Next,” the current date/time, and relevant upcoming activity are identifiable in the selected view.
- [ ] Completing or updating an activity changes its schedule/status consistently wherever that activity is shown.

### Starter activities, routines, tasks, and custom activities

Source: `scope.md > The Core Loop` and `Complete Product Scope`.

On first use, LXNORO presents a useful foundational set of common human activities as editable starter templates, such as breakfast, coffee/morning routine, sleep, shower, meals, medication, study, work, exercise, cleaning, shopping, travel, home time, family time, appointments, and rest. This is a starter foundation, not a claim about user history. Templates are visible on the first-use surface, can be kept, edited, or removed, and do not become scheduled events until the user explicitly schedules/activates them.

Users can create custom activities and activity types with their own emoji/symbol and any text label. A routine/activity can represent common or user-defined behavior and integrates into the same scheduling system. An activity representation remains understandable in the time grid and relevant views/reminders.

A task supports applicable title, date, time, duration, edit, alert on/off, repetition/repeat count, notes, and completion status. Its property model can be extended. Users can create, edit, complete, postpone, repeat, review, or otherwise update applicable tasks/routines.

- [ ] On first use, starter foundations are visible, but the time grid contains no scheduled events unless the user explicitly schedules them.
- [ ] The user can keep, edit, or remove starter items and schedule one into the matrix.
- [ ] A custom activity's chosen symbol and text appear together in the matrix and its relevant activity/reminder views.
- [ ] A task can be created and edited with its applicable date, time, alert, recurrence/count, note, and status; completion/update is reflected in the schedule.

### Notes

Source: `scope.md > The Core Loop` and `Complete Product Scope`.

Each task has a compact note when not being edited. Focusing/editing expands the note smoothly; it supports substantial text up to approximately 1,000 words. Saving preserves the complete text and collapses the note again. The complete saved note remains accessible from the task's display and when its reminder is triggered.

- [ ] A note expands for editing, accepts substantial text up to the stated approximate limit, saves without losing content, and returns to compact presentation after save.
- [ ] Opening the task or its reminder exposes the full saved note, not a truncated replacement.

### Micro-Bot reminders and platform behavior

Source: `scope.md > The Core Loop` and `Complete Product Scope`.

The Micro-Bot is connected to scheduling and reminder generation, rather than being a generic chatbot. When a task becomes due, it provides a concise, intentional interaction with task title, full notes, and relevant context. A short sound, vibration/haptic feedback, popup, or notification is delivered only where supported and permitted. Silent-mode detection is not claimed universally; when the platform exposes appropriate behavior, sound is suppressed as appropriate while haptics remain available where permitted.

Scheduling logic, reminder generation, notification delivery, and platform-specific capabilities are separate product responsibilities. The product does not assume ordinary browser timers or background delivery remain reliable while a tab is suspended. It explains unsupported capabilities, denied permission, or delivery limits usefully while preserving in-app access to tasks and notes.

- [ ] A due task's interaction identifies the correct task and presents its complete saved notes and relevant context.
- [ ] If notification permission is denied or a capability is unsupported, core task/schedule use continues and the user receives understandable feedback.
- [ ] The product never claims universal silent-mode detection, reliable suspended-tab delivery, or unsupported haptic capability.

### Weather and contextual information

Source: `scope.md > The Core Loop` and `Complete Product Scope`.

The user profile supports country and city. Lightweight weather context for the selected city can inform relevant reminders, such as expected rain, allowing time to leave, or bringing an umbrella. Weather is associated unobtrusively with relevant time/activity. If location/weather data or its service is unavailable, the core schedule, routines, notes, and reminders remain usable and the product reports context as unavailable without exposing technical internals.

- [ ] A configured city can supply relevant weather context where available.
- [ ] Weather failure/offline access does not block core time-management use and does not fabricate weather information.

### Shared Scheduling and Appointment Booking

Source: `scope.md > Shared Scheduling and Appointment Booking` and `Complete Product Scope`.

Shared appointment booking is a core capability of the complete product. It is not an optional concept, mockup, future enhancement, or capability excluded from product scope.

**Owner rules and shareable link:** The owner can create a shareable booking link and configure one or more allowed durations, available weekdays and time windows, minimum advance notice, maximum advance booking window, before/after buffers, booking time zone, optional link expiry/disablement, and conflict checking against their actual schedule. Manual approval is mandatory for every request; no automatic confirmation setting or behavior exists.

**Availability and privacy:** A requester sees only genuinely available time slots and their local-time conversion when different from the booking time zone. The booking interface reveals no private task/event/note, personal schedule detail, or reason that a time is unavailable. Unavailable times are never offered as bookable.

**Request and owner review:** The requester supplies full name, email address, and optional short message, then selects a day, available time, and one of the allowed durations. Submission creates a Pending request. The owner is notified when the request is created, on that same day. The notification contains the booking request details needed for review, including requester identity/contact, requested time and duration, and any optional message. Pending requests are never approved or rejected automatically. Owner notifications respect notification preferences and supported channels, identify that manual action is required, and show the number of Pending requests plus relevant appointment times when there are multiple.

Starting 24 hours before the requested appointment time, reminders repeat every three hours while the request remains Pending, except during the owner's configured sleep/rest period. They are intended to give the owner an opportunity to act before the requested time and never decide on the owner's behalf.

**Approval, rejection, and email:** Before approval, LXNORO verifies the requested slot is still available and conflict-free. If valid, the owner may explicitly approve; the appointment is immediately confirmed and added to the owner's schedule, planning, and reminder system. LXNORO then attempts to send a confirmation email to the requester, addressing them by their supplied name and including the confirmed date, time, duration, and relevant appointment details. If delivery fails, the failure is recorded, delivery is retried according to a safe retry policy, and the owner is notified. The appointment remains confirmed and is never canceled or rolled back solely due to email failure. Explicit rejection does not confirm or add the requested appointment.

**Alternative proposals:** After rejecting a requested appointment, the owner can manually propose an alternative on any suitable day, at any suitable time, and for any suitable duration, without restriction to the originally requested slot or the requester's allowed-duration choices. The requester must accept or reject the proposal. Acceptance triggers an immediate availability/conflict recheck. If the slot remains available, LXNORO confirms and adds the appointment and attempts the confirmation email. If not, confirmation is blocked, the requester is informed that the slot is no longer available, and the request returns to the owner so they can propose another alternative. The new proposal also requires requester acceptance before confirmation. Rejection creates no appointment; the current request is closed/rejected, and the owner may send another alternative later.

**Pending request conflict:** If availability changes while a request is Pending, the request remains Pending until the owner explicitly rejects it or proposes an alternative. LXNORO blocks approval of the unavailable original slot and clearly shows the owner it is no longer available. The owner can reject it or propose any suitable new day, time, and duration. The requester must accept an alternative before it becomes confirmed. Conflicting appointments are never created.

- [ ] A booking link exposes available slots only, with no private schedule/task/note details or unavailable-time reason.
- [ ] A request includes requester name/email and optional message, starts Pending, and cannot be confirmed until explicit owner approval.
- [ ] The owner's new-request notification includes enough booking details to review the requester and requested appointment.
- [ ] The owner can approve only while the requested slot remains available and conflict-free; rejection never adds the requested event.
- [ ] Owner reminders show the required Pending count/times, follow the same-day and pre-appointment cadence, respect configured sleep/rest time, and never decide automatically.
- [ ] An approved appointment appears in the owner's time matrix and planning/reminder views; its confirmation email contains the required requester name, date, time, duration, and details.
- [ ] Email failure is visible to the owner and retried without removing or canceling a confirmed appointment.
- [ ] An alternative can use any suitable day, time, and duration; it remains unconfirmed until requester acceptance and a successful final conflict check.
- [ ] If a pending/or alternative slot becomes unavailable, confirmation is blocked, private schedule data remains hidden, and the owner/requester receives the appropriate next action described above.
- [ ] Booking date/time is correctly represented in the booking time zone and requester-local display.

### Localization, privacy, offline behavior, and AI boundaries

Source: `scope.md > Complete Product Scope`.

Arabic and English are supported from the beginning through centralized localization. Switching language correctly changes direction (RTL/LTR), labels, dates/times, notifications, form alignment, navigation, activity representations, and responsive behavior. Readable contrast, keyboard use where applicable, touch-friendly targets, and reduced motion where practical support accessibility.

Personal tasks, routines, notes, schedules, and booking-owner data are sensitive. The product minimizes unnecessary collection and third-party transmission and keeps personal data local where technically practical. Core stored views, edits, horizon navigation, and saved notes work offline where practical. Weather and shared booking/email require external availability and fail without breaking local core behavior. Storage and future synchronization remain modular; credentials and private API keys are not placed in source control. User input is validated and rendered safely.

AI is used only where it gives a concrete product benefit and does not become a dependency of the core time system. Candidate assistance includes structuring natural-language task/routine input, scheduling suggestions, conflict identification, contextual suggestions, or note summaries. Any such capability must be evaluated for usefulness, privacy, latency, cost, availability, offline behavior, and complexity. No generic chatbot or AI provider has been selected as a product requirement.

- [ ] Switching English/Arabic changes labels and direction correctly throughout the supported interfaces and reminder messages.
- [ ] Offline or external-service failure does not erase or block access to saved core planning data.
- [ ] Private booking details never leak through a public booking link or availability result.

## States and Boundaries

- **First use:** The current day/time, time scale, Now marker, empty schedule grid, horizon navigation, available country/city/weather context, and directly visible starter foundations are shown. No starter is represented as an already-scheduled activity; no fake tasks or sample appointments appear.
- **Normal planning:** User-created/scheduled activities, custom symbols/labels, notes, recurrence, status, contextual data, and current/next indicators appear in their appropriate matrix horizon.
- **No activity scheduled:** The grid remains structured and usable; the first-activity action and starter foundations remain visible without presenting fabricated history.
- **Weather unavailable/offline:** Weather is omitted or identified as unavailable; core planning remains usable and no weather is invented.
- **Notification permission denied/unsupported:** The user gets useful capability feedback; saved task data and in-app views remain accessible. Sound/haptics/background delivery are represented honestly.
- **Storage failure/invalid input:** The product gives useful nontechnical feedback, protects existing saved content where possible, and does not expose internals or silently treat invalid data as saved.
- **Booking link disabled/expired:** No booking can be submitted through that link; private schedule details remain undisclosed.
- **Pending booking:** Request remains Pending until owner action; same-day and time-aware reminders may be sent per the specified cadence and preferences, with no automatic decision.
- **Requested slot becomes unavailable:** Owner cannot approve that slot; the request remains Pending and clearly indicates the conflict until the owner rejects it or proposes an alternative.
- **Alternative awaiting requester:** The alternative is not an appointment. Requester acceptance causes a fresh conflict check; rejection creates no appointment and closes/rejects that request.
- **Confirmation email failure:** Appointment remains confirmed and scheduled; failure is recorded, safe retry is attempted, and owner is informed.
- **Language change:** The interface, direction, and applicable dates/times/messages update consistently without changing the user's schedule data.

## Product Decisions

- LXNORO is a complete long-term personal product; the hackathon proof of concept and short video determine implementation/demo priority, not product scope.
- The product is for an individual personal schedule, not teams or project management.
- The core interaction is an original responsive time matrix with horizontal temporal progression and vertically organized activities/categories.
- The first-use schedule is empty and truthful; common starter foundations are visible directly on the first-use surface but enter the time grid only when explicitly scheduled.
- Activities use emoji/symbol plus text as meaningful representation, and the user can customize both.
- The current implementation is the actual responsive web platform, demonstrated primarily at phone dimensions. It is the foundation for later mobile-application evolution and Google Play distribution; no native app is built in this phase. Desktop/laptop and supported square/round smartwatch experiences remain in the complete product.
- Shared appointment booking is a core complete-product capability. Every request requires manual owner approval; alternative appointments additionally require requester acceptance and an availability recheck.
- Booking requester data is limited to full name, email, and optional short message. Public booking views expose availability only.
- Confirmed appointments are added immediately on successful owner approval/requester acceptance. Confirmation email delivery is attempted afterward and cannot roll back confirmation.
- Arabic RTL and English LTR, privacy-conscious local-first behavior, offline core access where practical, and honest browser/platform limitations are foundational.
- Visual direction is dark/pastel purple, futuristic and gaming-inspired but not a game, restrained for readability/performance; typography is readable modern sans-serif, with exact font chosen in implementation.

## What We're Building
The full product requirements in `scope.md > Complete Product Scope` and `Shared Scheduling and Appointment Booking`, elaborated above: the connected five-horizon time system; starter, routine, task, recurrence and note behavior; contextual Micro-Bot reminders; city-based weather context; privacy-conscious/offline core; responsive web experience for desktop, phone, and supported smartwatch displays; Arabic/English localization; and shared appointment booking with privacy, time-zone conversion, explicit approval, alternatives, conflict prevention, notifications, and email. The product is a continuing web foundation, not a disposable prototype or reduced derivative.

## Hackathon Implementation and Demo Priority
Build the actual responsive web platform and center the short demonstration on the phone-sized intention-to-action flow in `scope.md > What "Working" Looks Like` and `The POC Boundary`: configure a timed repeating activity with expandable notes, see it in upcoming time structure, show weather when available, reach its due moment, receive the strongest supported reminder with full notes, then complete/update it and see the schedule change. A video focused on this flow is a demonstration choice, not a statement that shared booking or any other complete-product capability is optional, future, or removed from the product.

The requested platform limitations (notification permission, background delivery, silent-mode detection, haptics, weather/email service availability, and device geometry) must be stated truthfully and shown only as verified. No platform/provider/framework decision is made in this PRD.

## Full Product Scope Boundary
No capability in the complete product scope is removed, cut, or designated optional by the hackathon demonstration boundary. The video focuses on a representative working time-planning/reminder journey and does not redefine the product or its full functional requirements. Shared Scheduling and Appointment Booking remains a core complete-product requirement.

## Non-Goals

- A team/project-management product; the intended experience is personal.
- A generic chatbot or autonomous AI agent added without a concrete product benefit.
- A native mobile application in the current responsive-web implementation phase (later mobile evolution and Google Play distribution remain intended).
- Any booking page or notification that exposes the owner's private schedule, tasks, notes, or reasons for unavailability.
- Any claim that browser/device APIs can universally detect silent mode or guarantee background reminder delivery.
- Any fabricated sample tasks, appointments, or user history on first use.

## Open Questions

These are technical/service decisions for `4-spec`, not unresolved product behavior:

- Which weather service and data/licensing terms meet the product's coverage, privacy, reliability, rate-limit, and cost needs?
- What browser/device reminder mechanisms are supported on the selected targets, and which limitations apply to foreground/background delivery, sound, haptics, and permissions?
- What external email and booking-link delivery model can support private availability, time-zone correctness, approval flows, conflict rechecks, safe retry, and owner/requester notifications?
- What local persistence and offline behavior are practical in the inspected environment, and how should a future optional synchronization path remain decoupled?
- Which, if any, AI-assisted candidate provides enough user benefit to justify its privacy, latency, cost, availability, and complexity? The core system must remain useful without it.
- Which supported browsers/devices and watch browser capabilities can be verified for the responsive web platform?


