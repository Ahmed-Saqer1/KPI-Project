# Cytogenetics KPI API (FastAPI)

Minimal FastAPI backend for MVP.

## Quickstart

```bash
# 1) Create a virtual environment (PowerShell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2) Install dependencies
pip install -r requirements.txt

# 3) Run the server (http://127.0.0.1:8000)
uvicorn app.main:app --reload
```

## Endpoints
- `/` root info
- `/api/v1/health` health status
- `/api/v1/kpi/config` (GET) return KPI YAML
- `/api/v1/kpi/compute` (POST) compute KPIs for a period
- `/api/v1/powerbi/embed-info` (GET) PowerBI embed metadata & token (requires PBI_* env vars)
- `/api/v1/logs` (GET) recent logs with optional `limit`, `level`, `since`

---

## KPI Engine

This adds configuration-driven KPI computation with two endpoints.

### Config
Config lives at `config/kpi_config.yaml` (or override with `KPI_CONFIG_PATH`). It defines thresholds and baselines, e.g.:

```yaml
kpis:
  cytogenetics_total_volume:
    thresholds: { warning: 20, critical: 10 }
  tat:
    thresholds: { warning: 48, critical: 72 }
  tests_per_fte:
    baseline_per_fte_per_day: 8  # aka hours_per_fte_day
```

### Endpoints

- `GET /api/v1/kpi/config` → returns the loaded YAML (sans internal fields)
- `POST /api/v1/kpi/compute` → computes KPIs for a period

Request body:

```json
{
  "period": { "start_date": "2025-08-01", "end_date": "2025-08-20" },
  "tests": [
    {
      "category": "CYTO",
      "collected_at": "2025-08-05T09:00:00Z",
      "signed_out_at": "2025-08-06T16:10:00Z"
    }
  ],
  "productivity": [
    { "date": "2025-08-01", "staff_id": "EMP-001", "hours_worked": 8, "remote_hours": 2, "in_lab_hours": 6 }
  ]
}
```

Notes:
- `tests` supports keys `type/category` and timestamp pairs `(received_at|collected_at)` → `(resulted_at|signed_out_at)`.
- If `productivity` is omitted, tests per FTE will be computed without hours (value may be null). Provide productivity hours via the payload (or upload client-side in the frontend) to enable full KPI calculation.

Response excerpt:

```json
{
  "meta": { "period": {"start_date":"2025-08-01","end_date":"2025-08-20"} },
  "metrics": {
    "cytogenetics_total_volume": { "total": 8, "status": "warning" },
    "total_volume": { "total": 25 },
    "tat": { "count": 20, "avg_hours": 36.5, "min_hours": 5.2, "max_hours": 72.1, "status": "warning" },
    "percent_change": { "mom": -12.5, "yoy": 8.0 },
    "tests_per_fte": { "tests": 25, "total_hours": 112, "fte_equivalents": 14, "hours_per_fte_day": 8, "value": 1.79 }
  }
}
```

## CORS
Default origin allowed: `http://localhost:5173` (Vite dev server).

## Notes
- HIPAA-aware: do not log or return PHI.
- Version is controlled via `APP_VERSION` env var (see `.env.example`).

---

## Productivity Input (Local)

Google Sheets integration has been removed in favor of HIPAA-aware local file upload and direct payload submission.

Options:
- Include `productivity` in the `POST /api/v1/kpi/compute` request body (see example above).
- Or, in the frontend, upload a local CSV/TSV/XLS/XLSX file. The client parses and normalizes rows and passes them to the backend as `productivity` for KPI computation.

Expected fields per item:
- `date` (YYYY-MM-DD)
- `staff_id` (string)
- `staff_name` (optional)
- `hours_worked` (optional; if omitted, computed from `remote_hours + in_lab_hours` when available)
- `remote_hours` (optional)
- `in_lab_hours` (optional)
