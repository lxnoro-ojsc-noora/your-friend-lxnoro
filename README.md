# Your friend LXNORO 03

A lightweight personal digital companion and Time Engine that carries an individual's plans from long-range horizons into timely, actionable daily moments.

## Current MVP

LXNORO consolidates personal time management across five planning horizons: Daily, Weekly, Monthly, Yearly, and Five-Year.

### Core Features Implemented
- **Five Planning Horizons:** Navigate seamlessly between Daily, Weekly, Monthly, Yearly, and Five-Year views.
- **Activity & Routine Management:** 
  - Create custom tasks with customizable symbols/emojis, titles, dates, times, durations, notes, and fixed routine recurrence options (`daily`, `weekly`, `monthly`, `yearly`).
  - Schedule tasks instantly from 16 built-in starter elements.
  - Inline editing and deletion with confirmation.
- **Precise Recurrence & Horizon Filtering:** Date-aware occurrence matching ensures recurring routines appear strictly in their scheduled periods without cross-horizon leakage.
- **Local Persistence & Backup:** Activities are persisted via SQLite (`.data/streamlit_demo.sqlite`), with full support for JSON data export (backup) and import (restore).
- **Interface & Design:** Futuristic dark theme with a live interactive clock.

## Getting Started & Running the MVP

### Prerequisites
- Python 3.8+
- Node.js (v18+ recommended, for repository tests and foundation components)

### Running the Streamlit MVP
1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the application:
   ```bash
   streamlit run streamlit_app.py
   ```

### Running Foundation / Test Scripts (Node & TypeScript)
- **Type Checking:**
  ```bash
  npm run typecheck
  ```
- **Run Test Suite:**
  ```bash
  npm test
  ```

## Planned / Future Features (Roadmap)
The following capabilities are part of the broader system architecture and roadmap but are not active in the current Streamlit MVP:
- **Micro-Bot Engine:** Automated background reminder notifications and system alerts.
- **Transactional Email Dispatch:** SMTP-based booking confirmations and reminder dispatch via Nodemailer.
- **Shared Appointment Booking:** Public availability links, conflict prevention, and approval workflows.
- **Weather Integration:** MET Norway locationforecast weather caching and location preferences.
- **Browser-Level Encryption:** Advanced client-side IndexedDB encryption and offline service worker guarantees.

## License
MIT License. See [LICENSE](LICENSE) for details.
