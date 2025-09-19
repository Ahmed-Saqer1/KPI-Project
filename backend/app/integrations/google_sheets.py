import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import gspread
from google.oauth2.service_account import Credentials

try:
    # Optional: used to fetch Drive file metadata (modifiedTime, version)
    from googleapiclient.discovery import build as gapi_build
    _HAS_DRIVE = True
except Exception:  # pragma: no cover
    gapi_build = None
    _HAS_DRIVE = False

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
]


@dataclass
class SheetsSettings:
    spreadsheet_id: str
    productivity_worksheet: str = "Productivity"
    sa_file: str = ""
    sa_json: str = ""


def _load_credentials(sa_file: str = "", sa_json: str = "") -> Credentials:
    if sa_json:
        try:
            info = json.loads(sa_json)
        except json.JSONDecodeError as e:
            raise ValueError("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON") from e
        creds = Credentials.from_service_account_info(info, scopes=SCOPES)
        return creds

    if sa_file:
        if not os.path.exists(sa_file):
            raise FileNotFoundError(f"Service account file not found: {sa_file}")
        creds = Credentials.from_service_account_file(sa_file, scopes=SCOPES)
        return creds

    raise ValueError("Service account credentials not provided. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE.")


def _client(creds: Credentials) -> gspread.Client:
    return gspread.authorize(creds)


def _drive_service(creds: Credentials):
    if not _HAS_DRIVE:
        return None
    try:
        return gapi_build("drive", "v3", credentials=creds, cache_discovery=False)
    except Exception as e:  # pragma: no cover
        logger.warning("Failed to build Drive client: %s", e)
        return None


def get_spreadsheet_and_meta(settings: SheetsSettings) -> Tuple[gspread.Spreadsheet, Dict[str, Any]]:
    creds = _load_credentials(settings.sa_file, settings.sa_json)
    client = _client(creds)
    ss = client.open_by_key(settings.spreadsheet_id)

    meta = {
        "spreadsheetId": settings.spreadsheet_id,
        "title": getattr(ss, "title", None),
        "fetchedAt": datetime.utcnow().isoformat() + "Z",
    }

    drive = _drive_service(creds)
    if drive is not None:
        try:
            f = (
                drive.files()
                .get(fileId=settings.spreadsheet_id, fields="id,name,modifiedTime,version")
                .execute()
            )
            meta.update({
                "name": f.get("name"),
                "modifiedTime": f.get("modifiedTime"),
                "version": f.get("version"),
            })
        except Exception as e:  # pragma: no cover
            logger.warning("Drive metadata fetch failed: %s", e)

    return ss, meta


def get_or_create_worksheet(ss: gspread.Spreadsheet, title: str) -> gspread.Worksheet:
    try:
        return ss.worksheet(title)
    except gspread.WorksheetNotFound:
        ws = ss.add_worksheet(title=title, rows=200, cols=12)
        return ws


DEFAULT_HEADERS = [
    "date",  # YYYY-MM-DD
    "staff_id",
    "staff_name",
    "hours_worked",
    "remote_hours",
    "in_lab_hours",
    "total_hours",
]


def ensure_headers(ws: gspread.Worksheet, headers: List[str] = DEFAULT_HEADERS) -> None:
    values = ws.get_all_values()
    if not values:
        ws.update("A1", [headers])
        return
    first_row = values[0]
    # If headers mismatch, overwrite to enforce schema for MVP
    if [h.strip().lower() for h in first_row] != [h.strip().lower() for h in headers]:
        ws.update("A1", [headers])


# --- Reading & validation ---

def _to_float(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    try:
        return float(val)
    except Exception:
        return None


def _valid_date(val: Any) -> Optional[str]:
    if not val:
        return None
    s = str(val).strip()
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return s
    except Exception:
        return None


def read_productivity(settings: SheetsSettings, date: Optional[str] = None, staff_id: Optional[str] = None) -> Dict[str, Any]:
    ss, meta = get_spreadsheet_and_meta(settings)
    ws = get_or_create_worksheet(ss, settings.productivity_worksheet)
    ensure_headers(ws)

    records = ws.get_all_records()  # type: ignore

    cleaned: List[Dict[str, Any]] = []
    skipped = 0

    for r in records:
        d = _valid_date(r.get("date"))
        sid = str(r.get("staff_id")) if r.get("staff_id") not in (None, "") else None
        name = r.get("staff_name") or None
        hours = _to_float(r.get("hours_worked"))
        remote = _to_float(r.get("remote_hours"))
        in_lab = _to_float(r.get("in_lab_hours"))
        total = _to_float(r.get("total_hours"))

        if d is None or sid is None:
            skipped += 1
            continue

        # Auto compute totals if missing
        if total is None and (remote is not None and in_lab is not None):
            total = (remote or 0.0) + (in_lab or 0.0)
        if hours is None and total is not None:
            hours = total

        item = {
            "date": d,
            "staff_id": sid,
            "staff_name": name,
            "hours_worked": hours,
            "remote_hours": remote,
            "in_lab_hours": in_lab,
            "total_hours": total,
        }

        if date and d != date:
            continue
        if staff_id and sid != staff_id:
            continue

        cleaned.append(item)

    logger.info(
        "Sheets read: rows=%s skipped=%s spreadsheet=%s version=%s",
        len(cleaned),
        skipped,
        meta.get("title") or meta.get("name"),
        meta.get("version"),
    )

    return {
        "meta": meta,
        "count": len(cleaned),
        "skipped": skipped,
        "items": cleaned,
        "loggedAt": datetime.utcnow().isoformat() + "Z",
    }


def read_column_average(settings: SheetsSettings, column_name: str = "TAT", worksheet: Optional[str] = None) -> Dict[str, Any]:
    """
    Compute the average of a numeric column from a Google Sheets worksheet without
    enforcing/overwriting headers. Column matching is case-insensitive and ignores
    spaces/underscores.

    Returns a dict with: meta, worksheet, column, count, avg, loggedAt.
    """
    ss, meta = get_spreadsheet_and_meta(settings)
    title = worksheet or settings.productivity_worksheet

    try:
        ws = ss.worksheet(title)
    except gspread.WorksheetNotFound as e:
        raise ValueError(f"Worksheet not found: {title}") from e

    values = ws.get_all_values()
    if not values:
        return {
            "meta": meta,
            "worksheet": title,
            "column": column_name,
            "count": 0,
            "avg": None,
            "loggedAt": datetime.utcnow().isoformat() + "Z",
        }

    def _norm(s: Any) -> str:
        return str(s).strip().lower().replace(" ", "").replace("_", "")

    headers = values[0]
    headers_norm = [_norm(h) for h in headers]

    # Accept common variants for TAT column
    col_variants = list({
        _norm(column_name),
        "tat",
        "tathours",
        "turnaroundtime",
        "turnaroundhours",
    })

    idx = -1
    for v in col_variants:
        try:
            idx = headers_norm.index(v)
            break
        except ValueError:
            continue

    if idx == -1:
        raise ValueError(f"Column not found: {column_name}")

    nums: List[float] = []
    for row in values[1:]:
        try:
            cell = row[idx] if idx < len(row) else ""
        except Exception:
            cell = ""
        val = _to_float(cell)
        if val is not None:
            nums.append(val)

    avg_val = (sum(nums) / len(nums)) if nums else None

    logger.info(
        "Sheets column average: worksheet=%s column=%s count=%s avg=%s",
        title,
        column_name,
        len(nums),
        avg_val,
    )

    return {
        "meta": meta,
        "worksheet": title,
        "column": column_name,
        "count": len(nums),
        "avg": avg_val,
        "loggedAt": datetime.utcnow().isoformat() + "Z",
    }


# --- Append (input) ---

def append_productivity(settings: SheetsSettings, entry: Dict[str, Any]) -> Dict[str, Any]:
    ss, meta = get_spreadsheet_and_meta(settings)
    ws = get_or_create_worksheet(ss, settings.productivity_worksheet)
    ensure_headers(ws)

    d = _valid_date(entry.get("date"))
    if d is None:
        raise ValueError("Invalid or missing 'date' (YYYY-MM-DD)")

    sid = entry.get("staff_id")
    if not sid:
        raise ValueError("Missing 'staff_id'")

    name = entry.get("staff_name") or ""

    remote = _to_float(entry.get("remote_hours")) or 0.0
    in_lab = _to_float(entry.get("in_lab_hours")) or 0.0

    hours = entry.get("hours_worked")
    hours_f = _to_float(hours)
    if hours_f is None:
        hours_f = remote + in_lab

    total = remote + in_lab

    row = [
        d,
        str(sid),
        str(name),
        hours_f,
        remote,
        in_lab,
        total,
    ]

    ws.append_row(row, value_input_option="USER_ENTERED")

    logger.info(
        "Sheets append: staff_id=%s date=%s total=%.2f spreadsheet=%s version=%s",
        sid,
        d,
        total,
        meta.get("title") or meta.get("name"),
        meta.get("version"),
    )

    return {
        "meta": meta,
        "appended": True,
        "computed": {
            "hours_worked": hours_f,
            "total_hours": total,
        },
        "loggedAt": datetime.utcnow().isoformat() + "Z",
    }
