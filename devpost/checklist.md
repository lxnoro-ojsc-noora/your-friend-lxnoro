---
doc: checklist
status: approved
---

# Build Checklist — Your friend LXNORO (Current MVP Status)

## Implemented MVP Slices
- [x] **1. Five Planning Horizons & Time Matrix (`streamlit_app.py`)**
  - Streamlit-powered personal time engine with Daily, Weekly, Monthly, Yearly, and Five-Year horizon navigation.
  - Interactive live clock and futuristic dark theme styling.
- [x] **2. Activity & Routine Management with Recurrence & Filtering**
  - Create custom tasks, schedule from 16 starter elements, inline edit, and delete with confirmation.
  - Precise recurrence (`daily`, `weekly`, `monthly`, `yearly`) and exact-period date-aware horizon matching without leakage.
- [x] **3. Local Persistence & JSON Backup/Restore**
  - Local SQLite storage (`.data/streamlit_demo.sqlite`).
  - Transactional JSON backup export and restore validation.

## Planned / Future Slices (Roadmap)
- [ ] Micro-Bot automated push notifications and reminders.
- [ ] Shared appointment booking API and owner approval workflows.
- [ ] MET Norway weather context caching.
- [ ] SMTP email confirmation dispatch.
- [ ] Client-side encryption and offline PWA service worker caching.
