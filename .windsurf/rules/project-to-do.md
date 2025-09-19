---
trigger: always_on
---

# ✅ Windsurf To-Do List for Cytogenetics Productivity & KPI Tracker

## Rules
- Always build in **small, testable increments**.  
- Each task must be **checkable** and committed with a clear description.  
- Use **Python (FastAPI)** for backend, **React** for frontend.  
- Keep code **HIPAA-aware** (no unnecessary PHI exposure).  
- All KPI formulas/thresholds should live in a **config file (YAML/JSON)**.  
- Log all integrations and errors with timestamps.  
- Defer **role-based access & alerting** to Phase 2.  
- Assume **local deployment** for Phase 1 (no cloud infra yet).  
-Mark off completed steps in @Master Plan when completeting

---

## Phase 1 (POC / MVP)

### 1. Project Setup
- [ ] Initialize FastAPI backend (Python) with modular RESTful architecture  
- [ ] Initialize React frontend with responsive design (Chrome/Edge/Firefox)  
- [ ] Create repo structure:
  - `/backend` → FastAPI, KPI engine, integrations  
  - `/frontend` → React UI  
  - `/config` → YAML/JSON for KPI formulas & thresholds  

---

### 2. Google Sheets Integration (Read + Input)
- [ ] Connect to Google Sheets API (service account auth)  
- [ ] Implement read:
  - Validate data formats  
  - Handle blank/malformed rows  
  - Log pulls with timestamps + sheet versions  
- [ ] Implement input:
  - Manager can enter daily productivity data (FTE hours worked, remote/in-lab)  
  - Save entries into Google Sheet  
  - Auto-calc totals per staff/day  
  - Confirm + persist successful entries  

---

### 3. MariaDB LIS Integration
- [ ] Establish read-only connection to MariaDB (LIS)  
- [ ] Pull specimen/test data on a schedule  
- [ ] Extract timestamps → calculate TAT per test type  
- [ ] Aggregate monthly data & compare to historical  

---

### 4. KPI Engine
- [ ] Implement KPI calculations:
  - FISH test volume (total + PET, ST, URO subtypes)  
  - Total Cytogenetics test volume  
  - TAT (avg, min, max)  
  - % change MoM + YoY  
  - Tests per FTE (8 cases/day = 1 FTE)  
- [ ] Store formulas/thresholds in config file (YAML/JSON)  

---

### 5. Dashboard & Reporting
- [ ] Build React dashboard:
  - KPI summaries with color-coded deltas  
  - Month/category switching  
  - Dynamic filters (date ranges, test category, FTE grouping)  
- [ ] Implement CSV export of KPI reports  
- [ ] Connect frontend to backend endpoints  

---

### 6. PowerBI Integration
- [ ] Add PowerBI API integration for advanced visualization  
- [ ] Secure connection (no PHI exposure, HIPAA-aware)  

---

### 7. Logging & Monitoring
- [ ] Log all data pulls (Google Sheets + LIS) with timestamps  
- [ ] Log KPI calculation errors/warnings  
- [ ] Store logs in backend (accessible via API)  

---

## Future Items (Phase 2+)
- [ ] Role-based authentication (Manager vs. Supervisor vs. Executive)  
- [ ] Alerting system (threshold breaches, TAT delays, etc.)  
- [ ] Editable manual entry forms (remove Google Sheets dependency)  
- [ ] Expansion beyond Cytogenetics dept.  
- [ ] Admin UI for logs + config management  
