---
doc: spec
status: approved
---

# Your friend LXNORO — Technical Spec (Current MVP)

## Runnable Entry Point & Architecture

The current runnable MVP entry point for Your Friend LXNORO is a Python application built with Streamlit (`streamlit_app.py`). 

- **UI & Framework:** Streamlit (Python) rendering a futuristic dark-themed personal planning matrix.
- **Persistence:** Local SQLite database (`.data/streamlit_demo.sqlite`) storing activities, routines, schedules, notes, and recurrence metadata.
- **Backup & Restore:** Transactional JSON export and import for user data backup.
- **Recurrence & Filtering Domain:** Robust date-aware occurrence calculation supporting daily, weekly, monthly, and yearly recurring routines across Daily, Weekly, Monthly, Yearly, and Five-Year horizons without cross-horizon leakage.

## Architecture Foundation Files (Repository Structure)
The repository also contains modular TypeScript / React frontend code (`src/`) and Fastify backend server code (`server/`) as part of the broader system architecture foundation and test suite (Vitest), though the live runnable MVP interface is `streamlit_app.py`.

## Planned / Future Architecture
- **Shared Booking Service:** Fastify and SQLite booking API, conflict checks, and owner approval workflows.
- **Weather Adapter:** MET Norway locationforecast proxy.
- **Email Delivery:** Nodemailer SMTP relay for confirmations.
- **Notifications & Encryption:** Micro-Bot push notifications and client-side encryption.
