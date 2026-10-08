---
doc: scope
status: approved
---

# Your friend LXNORO

One line: A lightweight personal digital companion and Micro-Bot Time Engine that carries an individual's plans from long-range horizons into timely, actionable daily moments.

## The Unique Kernel
LXNORO connects a person's time horizons and plans to the right action at the right time: it remembers the structured intention, brings back the task with its complete notes and useful context, and lets completion update the plan. This continuity across planning, routines, and contextual reminders is the product's defining value, not a generic calendar or chatbot interaction.

## Who It's For
An individual who wants one lightweight personal system for their own time, routines, tasks, reminders, notes, and longer-term plans. Today, they may assemble calendars, reminder apps, notes, alarms, weather information, and memory/manual checking; LXNORO consolidates those needs into one coherent, privacy-conscious experience. It is a personal companion, not a team or project-management tool.

## The Core Loop
The user checks what is relevant now and next, including time/context, upcoming routines or tasks, notes, reminders, and weather context when available. They create, edit, complete, postpone, repeat, or review an activity; at the scheduled time, the Micro-Bot returns it with its full saved notes and supported contextual notification, sound, and/or haptic feedback. The user acts and updates completion, while the connected schedule remains understandable across daily, weekly, monthly, yearly, and five-year views.

## Inspiration & Identity
A modern, premium, futuristic and gaming-inspired product (not a game): dark surfaces, pastel-purple accents, restrained glass-like layers, expressive icons, compact status indicators, and polished but lightweight transitions. Readability, accessibility, responsive behavior, and performance take priority over visual effects. English LTR and Arabic RTL are foundational, including localized dates, times, messages, and directional layouts.

## Why This Matters to the Learner
The learner wants to build LXNORO as the actual complete product for continued use and development, while understanding a structured AI-assisted, plan-first workflow from requirements through deployment. They want clear boundaries between agent implementation and human architectural judgment and verification, with a modular, maintainable codebase. Hackathon proof-of-concept constraints determine what is implemented and demonstrated first; they do not redefine or reduce the product.

## What "Working" Looks Like
The hackathon demonstration shows continuity from intention to action in the real responsive web platform, primarily at phone dimensions: create a scheduled routine/task with repetition and expandable notes; see it situated among upcoming plans; show relevant weather when available; reach its scheduled moment; receive the supported reminder with the task and full notes; then complete or update it and see the schedule reflect that change. The compelling moment is knowing what to do from the reminder without reconstructing the plan across separate apps. The demo and documentation must be honest about browser permission, background-delivery, sound, silent-mode, and haptic limitations.

## Complete Product Scope
The long-term product is the complete personal time-management system described in requirements Parts 1–8, including:

- A connected daily, weekly, monthly, yearly, and five-year planning model, with navigation that preserves context.
- Recurring and custom routines/activities with suitable icons, plus extensible tasks supporting dates, times, editing, alerts, repetition/count, completion state, and future properties.
- Compact task notes that expand for editing, support approximately 1,000 words, save and collapse cleanly, and remain accessible from task displays and reminders.
- A Micro-Bot reminder layer with task details, full notes, and relevant context; sound, vibration/haptics, popups/notifications, and silent-mode behavior only where browser/device capabilities permit. Scheduling, reminder generation, delivery, and platform capabilities remain separable; ordinary browser background delivery is not assumed reliable.
- Country/city profile context and lightweight weather-informed reminders, with graceful failure and no dependency of core planning on weather availability.
- One responsive web platform for desktop/laptop, phone, and supported square/round smartwatch displays, reorganizing content for each form factor. The web platform is the foundation for later mobile-application evolution and Google Play distribution; a native app is not the current implementation.
- English and Arabic localization from the beginning, including correct LTR/RTL layout and localized interface and reminder text; accessibility, touch/keyboard usability, reduced motion where practical, and readable contrast.
- Privacy-conscious, local-first data handling and practical offline use for stored plans, edits, navigation, and notes; modular storage that can support future synchronization without coupling core behavior to a network.
- Modular, maintainable boundaries for presentation, state, scheduling, tasks, routines, notes, reminders/platform capabilities, weather/context, localization, storage, and optional AI. AI candidates such as natural-language structuring, scheduling support, conflict identification, contextual suggestions, or note summaries are evaluated for real benefit, privacy, cost, latency, availability, and offline behavior; the core product does not depend on a provider or generic chatbot.
- Secure input and storage practices, intentional dependencies, useful failure handling, efficient behavior on modest devices, and documentation of integrations and platform limits.

### Shared Scheduling and Appointment Booking
Shared appointment booking is a core capability of the complete product. The user can create a shareable booking link and define booking rules, including the allowed appointment duration or durations. A requester using the link can see available booking times only; the interface must not disclose private tasks, notes, personal schedule details, or why any time is unavailable. The requester selects a day, available time, and duration, and the request remains Pending until the original user approves it.

The original user receives a notification with the booking request details. Approval adds the appointment to the user's schedule and connects it to the planning and reminder system; after approval and confirmation, an email is sent to the requester with the relevant person's name, appointment date, appointment time, duration, and appropriate appointment details. Rejection does not confirm the requested appointment or add it to the schedule. After rejecting a request, the original user can manually propose an alternative by selecting any suitable day, time, and duration, without being constrained to the originally requested time; the proposal is sent to the requester for acceptance or rejection.

The system prevents booking conflicts, including conflicts caused by availability changing while a request awaits approval. It handles time zones explicitly and correctly when the requester is in a different time zone. The user's private schedule remains private throughout booking; only availability is exposed through the booking interface.
## Hackathon Implementation and Demo Priority
Build the actual responsive web platform as the product foundation, with the end-to-end intention-to-action flow above as the first implementation and demonstration priority. Center the demo on a phone-sized responsive view. Make the chosen path genuinely functional across its UI, state, data handling, business logic, persistence, error handling, and supported reminder behavior; do not substitute a mockup or generic AI chat. Keep desktop/laptop and smartwatch support in the complete product architecture and responsive design. Do not build a native mobile application in this phase.

This priority is an execution sequence for the hackathon, not a reduced product definition. Weather and notification delivery must be shown only to the extent actually available and verified on the selected browser/device; their limitations do not remove them from the complete product.

## The POC Boundary
For the hackathon's working proof and short demonstration, prioritize one real phone-view web journey: create a timed, repeating activity with substantial notes; relate it to upcoming time plans; provide weather context if available; trigger the strongest supported reminder at the due time; expose the full notes; and record completion/update. The demo may focus on this journey, but the shipped web foundation and product architecture must preserve the complete product scope above. No framework, backend, weather provider, AI provider, or notification delivery mechanism is selected in this scope document.

## Later
Later implementation sequence may include deeper coverage of all planning horizons and activity types, fuller localization and accessibility refinement, robust offline/storage behavior, weather integration, reminder delivery across supported platform states, dedicated round/square smartwatch refinement, and the mobile-application evolution toward Google Play. These are continuing product capabilities from the complete scope, not features dropped from the product; technical sequencing and platform support will be resolved in PRD/spec and implementation planning.

## Explicitly Cut
No capability from product requirements Parts 1–8 is cut from the complete product scope. A native mobile application is not part of the current web-platform implementation, though later mobile evolution and Google Play distribution remain intended. A generic chatbot or provider-dependent AI core is outside the product direction.


