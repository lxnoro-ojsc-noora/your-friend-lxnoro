---
doc: scope
status: approved
---

# Your friend LXNORO

One line: A lightweight personal digital companion and Time Engine that carries an individual's plans from long-range horizons into timely, actionable daily moments.

## Current MVP Scope

Your Friend LXNORO currently implements a robust personal planning and time-management system powered by Python and Streamlit (`streamlit_app.py`). 

### Implemented Core Features
- **Five Planning Horizons:** Seamlessly navigate between Daily, Weekly, Monthly, Yearly, and Five-Year planning matrices.
- **Activity & Routine Management:** Create custom tasks and routines with custom symbols, titles, dates, times, durations, notes, and recurrence frequencies (`daily`, `weekly`, `monthly`, `yearly`).
- **Date-Aware Horizon Filtering:** Precise occurrence matching ensures recurring routines and one-time activities appear strictly within their scheduled periods without cross-horizon leakage.
- **Local Persistence & Backup:** Activities are stored locally using SQLite (`.data/streamlit_demo.sqlite`), with full support for JSON data export (backup) and import (restore).
- **Interface & Design:** Futuristic dark theme with an interactive live clock.

## Planned / Future Features (Roadmap)
The following capabilities are part of the broader system architecture design and future roadmap, but are not active in the current Streamlit MVP:
- **Micro-Bot Reminders:** Automated background push notifications and alerts.
- **Shared Appointment Booking:** Public availability links, conflict prevention, and owner approval workflows.
- **Weather Integration:** MET Norway Locationforecast weather context caching and location preferences.
- **Transactional Email Dispatch:** SMTP relay delivery for booking confirmations and reminders via Nodemailer.
- **Browser-Level Encryption & Offline PWA:** Advanced client-side IndexedDB encryption and offline service worker caching guarantees.

## Runnable Entry Point
To run the current MVP:
```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```
