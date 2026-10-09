# Your friend LXNORO 03

A lightweight personal digital companion and Micro-Bot Time Engine that carries an individual's plans from long-range horizons into timely, actionable daily moments.

## Project Overview

LXNORO consolidates time management, daily/weekly/monthly/yearly/five-year horizons, routines, tasks, expandable notes, Micro-Bot reminders, weather context, and a privacy-conscious shared booking service into one cohesive web platform.

## Architecture & Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Dexie (IndexedDB) for local-first encrypted-at-browser storage of personal plans, notes, and preferences.
- **Backend / Booking API:** Fastify, TypeScript, SQLite (`better-sqlite3`) for secure, privacy-safe availability projection and appointment approval workflows.
- **Integrations:** 
  - **MET Norway Locationforecast:** Optional, permission-based weather context adapter with coordinate rounding and caching.
  - **Nodemailer SMTP Relay:** Secure transactional email delivery for booking confirmations, alternative proposals, and owner reminders.
- **Localization:** Built-in English (LTR) and Arabic (RTL) support with localized date/time formatting and direction-aware layout.

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm

### Installation

```bash
npm install
```

### Running Locally

- **Start Web Client (Vite):**
  ```bash
  npm run dev:web
  ```
- **Start Booking Server (Fastify + SQLite):**
  ```bash
  npm run dev:server
  ```
- **Type Checking:**
  ```bash
  npm run typecheck
  ```
- **Run Test Suite (Vitest):**
  ```bash
  npm test
  ```
- **Production Build:**
  ```bash
  npm run build
  ```

## Privacy & Offline Behavior

- **Local-First Privacy:** Private schedules, routine titles, substantial notes (up to 1,000 words), preferences, and personal activities remain 100% on device in IndexedDB. No private activity titles or notes are ever uploaded to cloud servers.
- **Booking Projection Boundary:** Only anonymous, coalesced busy time intervals synchronize with the LXNORO booking service for conflict protection.
- **Offline Resilience:** Local plans, notes, and time matrices remain fully usable offline. Service worker caching preserves the application shell for offline reopening. Outbox interval updates queue locally and sync automatically upon reconnection.

## Platform Limits & Deployment

- **Browser Capabilities:** Notifications require a secure context and user permission. Background execution and audio/haptic delivery depend on browser support. Closed-tab suspension is handled by refreshing and recomputing due instances upon app resume/focus.
- **LXNORO Hosting Requirements:** Production deployment requires an HTTPS-enabled environment, persistent Node.js process, durable writable SQLite path, secure session management, and configured SMTP relay environment variables (`LX_MAIL_HOST`, `LX_MAIL_PORT`, `LX_MAIL_USER`, `LX_MAIL_PASSWORD`, `LX_MAIL_FROM`).
