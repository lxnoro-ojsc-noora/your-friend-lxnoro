---
doc: prd
status: approved
---

# Your friend LXNORO — Product Requirements (MVP Scope)

One line: **Your friend LXNORO** is a lightweight personal digital companion and Time Engine for individuals who want one coherent system for their time, routines, tasks, notes, and plans from today through five years.

## Current MVP Implementation

### Personal time-planning journey

1. **Open the planning horizons.** The user opens the Streamlit application (`streamlit_app.py`) and sees the current time and active planning horizon. They can navigate between Daily, Weekly, Monthly, Yearly, and Five-Year views.
2. **Schedule and manage activities.** Users can schedule activities from 16 built-in starter elements, create custom tasks/routines with symbols, titles, dates, times, durations, recurrence (`daily`, `weekly`, `monthly`, `yearly`), and notes.
3. **Horizon filtering & recurrence:** Date-aware occurrence matching ensures activities and routines appear strictly in their scheduled periods without cross-horizon leakage.
4. **Persistence & backup:** Activities are stored in a local SQLite database (`.data/streamlit_demo.sqlite`) with full transactional JSON backup export and restore capabilities.
5. **Interface:** Built with a futuristic dark theme and a live interactive clock.

## Planned / Future Features (Roadmap)
- **Micro-Bot Notifications:** Automated browser push reminders and alerts.
- **Shared Appointment Booking:** Public availability links and approval workflows.
- **Weather Integration:** MET Norway location forecast caching.
- **Email Delivery:** SMTP-based booking confirmations.
- **Client-Side Encryption:** IndexedDB local encryption guarantees.
