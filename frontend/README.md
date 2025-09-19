# Cytogenetics KPI Frontend (React + Vite)

Minimal React app to connect to the FastAPI backend.

## Quickstart

```bash
# 1) Install Node.js 18+ (if not already)

# 2) Install dependencies
npm install

# 3) Start dev server (http://localhost:5173)
npm run dev
```

The dev server proxies `/api/*` to `http://127.0.0.1:8000`.

## KPI Dashboard (MVP)

- Features:
  - KPI summaries (Cytogenetics, Total, TAT, % change, Tests/FTE)
  - Date range with month switching
  - Local file upload (CSV/TSV/XLS/XLSX) to provide productivity hours client-side
  - CSV export of current KPI results
- Endpoints used:
  - `GET /api/v1/kpi/config`
  - `POST /api/v1/kpi/compute`

### How to use
1) Start backend (FastAPI) on `http://127.0.0.1:8000`.
2) Start frontend dev server (`npm run dev`).
3) In the "Current Period Summary" card:
   - Pick the start/end dates (defaults to current month). Use Prev/Next Month.
   - Upload productivity via the + button (CSV/TSV/XLS/XLSX). The client parses and normalizes, and passes it to the backend for KPI computation.
   - Paste tests JSON array or click "Testing" to inject sample tests + productivity.
   - KPIs auto-update when dates, tests JSON, or uploaded productivity change.
   - Click "Export CSV" to download a CSV of the displayed KPIs.

Notes:
- HIPAA-aware: no PHI is displayed; keep sample inputs HIPAA-safe.
- Google Sheets integration has been removed; productivity must be provided via local upload or request payload.
