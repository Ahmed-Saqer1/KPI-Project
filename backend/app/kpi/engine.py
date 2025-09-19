import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

logger = logging.getLogger(__name__)


# -------------------- Helpers --------------------

def _parse_dt(val: Optional[str]) -> Optional[datetime]:
    if not val:
        return None
    s = val.strip()
    try:
        # Handle trailing Z
        if s.endswith("Z"):
            s = s[:-1]
        # Replace space T separators
        s = s.replace(" ", "T") if "T" not in s else s
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _daterange_days(start: datetime, end: datetime) -> int:
    return max(0, (end.date() - start.date()).days + 1)


def _within_period(ts: Optional[datetime], start: datetime, end: datetime) -> bool:
    return ts is not None and start <= ts <= end


def _month_delta(d: datetime, months: int) -> datetime:
    # Simple month shift without external deps
    year = d.year + (d.month - 1 + months) // 12
    month = (d.month - 1 + months) % 12 + 1
    day = min(d.day, [31,
                      29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                      31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
    return d.replace(year=year, month=month, day=day)


# -------------------- Core Engine --------------------

@dataclass
class Period:
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD

    def to_datetimes(self) -> Tuple[datetime, datetime]:
        s = datetime.fromisoformat(self.start_date)
        e = datetime.fromisoformat(self.end_date) + timedelta(hours=23, minutes=59, seconds=59)
        if e < s:
            raise ValueError("end_date must be on/after start_date")
        return s, e


def _classify_test(rec: Dict[str, Any]) -> Tuple[str, Optional[str]]:
    """
    Return (category, subtype) normalized.
    category in {CYTO, OTHER}. Subtype is unused.
    """
    cat = (rec.get("type") or rec.get("category") or "").strip().upper()
    if cat in {"CYTO", "CYTOGENETICS", "KARYOTYPE"}:
        return "CYTO", None
    return "OTHER", None


def _tat_hours(rec: Dict[str, Any]) -> Optional[float]:
    # Prefer received_at -> resulted_at, else collected_at -> resulted_at
    start = _parse_dt(rec.get("received_at")) or _parse_dt(rec.get("collected_at"))
    end = _parse_dt(rec.get("resulted_at")) or _parse_dt(rec.get("signed_out_at"))
    if start and end and end >= start:
        return (end - start).total_seconds() / 3600.0
    return None


def _sum_hours_productivity(entries: Iterable[Dict[str, Any]], start: datetime, end: datetime) -> float:
    total = 0.0
    for r in entries:
        d = r.get("date")
        dt = None
        try:
            if d:
                dt = datetime.fromisoformat(str(d))
        except Exception:
            dt = None
        if dt and start.date() <= dt.date() <= end.date():
            # hours_worked preferred; else remote+in_lab; else total_hours
            def _to_float(x):
                try:
                    return float(x)
                except Exception:
                    return 0.0
            hours = r.get("hours_worked")
            if hours is not None and str(hours) != "":
                total += _to_float(hours)
                continue
            remote = _to_float(r.get("remote_hours"))
            in_lab = _to_float(r.get("in_lab_hours"))
            if remote or in_lab:
                total += remote + in_lab
                continue
            total += _to_float(r.get("total_hours"))
    return total


def _coerce_period(p: Any) -> Period:
    if isinstance(p, Period):
        return p
    # Pydantic model or simple object
    if hasattr(p, "start_date") and hasattr(p, "end_date"):
        return Period(start_date=str(getattr(p, "start_date")), end_date=str(getattr(p, "end_date")))
    # Mapping/dict
    try:
        return Period(start_date=str(p["start_date"]), end_date=str(p["end_date"]))
    except Exception:
        raise ValueError("Invalid period; expected {start_date, end_date}")


def compute_kpis(
    config: Dict[str, Any],
    period: Any,
    tests: List[Dict[str, Any]],
    productivity: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """
    Compute KPIs for the provided period and input data.

    Inputs:
      - config: loaded YAML config
      - period: date range
      - tests: list of test dicts. Fields used: type/category, received_at/collected_at, resulted_at
      - productivity: optional list of productivity entries with hours fields

    Returns a dict with metrics and statuses.
    """
    period_obj = _coerce_period(period)
    s, e = period_obj.to_datetimes()

    # Filter tests within the period by resulted_at or received_at if missing
    tests_in_period: List[Dict[str, Any]] = []
    for t in tests:
        ended = _parse_dt(t.get("resulted_at"))
        started = _parse_dt(t.get("received_at")) or _parse_dt(t.get("collected_at"))
        timestamp = ended or started
        if _within_period(timestamp, s, e):
            tests_in_period.append(t)

    # --- Volumes (CYTO-only indicators) ---
    cyto_total = 0

    tat_values: List[float] = []

    for t in tests_in_period:
        cat, _ = _classify_test(t)
        if cat == "CYTO":
            cyto_total += 1
        # TAT
        tat = _tat_hours(t)
        if tat is not None:
            tat_values.append(tat)

    # Total volume counts all tests in period (not category-specific)
    total_volume = len(tests_in_period)

    # --- Threshold evaluation helpers ---
    def volume_status(value: int, k: str) -> str:
        th = (config.get("kpis", {}).get(k, {}).get("thresholds") or {})
        warn = th.get("warning")
        crit = th.get("critical")
        if crit is not None and value <= crit:
            return "critical"
        if warn is not None and value <= warn:
            return "warning"
        return "ok"

    def tat_status(avg_hours: Optional[float]) -> str:
        th = (config.get("kpis", {}).get("tat", {}).get("thresholds") or {})
        warn = th.get("warning")
        crit = th.get("critical")
        if avg_hours is None:
            return "unknown"
        if crit is not None and avg_hours >= float(crit):
            return "critical"
        if warn is not None and avg_hours >= float(warn):
            return "warning"
        return "ok"

    # --- TAT aggregates ---
    tat_agg = None
    if tat_values:
        tat_min = min(tat_values)
        tat_max = max(tat_values)
        tat_avg = sum(tat_values) / len(tat_values)
        tat_agg = {
            "count": len(tat_values),
            "min_hours": tat_min,
            "max_hours": tat_max,
            "avg_hours": tat_avg,
            "status": tat_status(tat_avg),
        }
    else:
        tat_agg = {
            "count": 0,
            "min_hours": None,
            "max_hours": None,
            "avg_hours": None,
            "status": "unknown",
        }

    # --- Percent change MoM/YoY (based on total volume) ---
    # Define previous periods
    ps, pe = s, e
    prev_month_s = _month_delta(ps, -1)
    prev_month_e = _month_delta(pe, -1)
    prev_year_s = ps.replace(year=ps.year - 1)
    prev_year_e = pe.replace(year=pe.year - 1)

    def _count_in_range(_s: datetime, _e: datetime) -> int:
        cnt = 0
        for t in tests:
            ended = _parse_dt(t.get("resulted_at"))
            started = _parse_dt(t.get("received_at")) or _parse_dt(t.get("collected_at"))
            timestamp = ended or started
            if _within_period(timestamp, _s, _e):
                cnt += 1
        return cnt

    prev_month_total = _count_in_range(prev_month_s, prev_month_e)
    prev_year_total = _count_in_range(prev_year_s, prev_year_e)

    def pct_change(current: int, previous: int) -> Optional[float]:
        if previous is None or previous == 0:
            return None
        return (current - previous) * 100.0 / previous

    mom = pct_change(total_volume, prev_month_total) if prev_month_total is not None else None
    yoy = pct_change(total_volume, prev_year_total) if prev_year_total is not None else None

    # --- Tests per FTE ---
    tests_per_fte = None
    fte_equivalents = None
    total_hours = None
    tpf_cfg = config.get("kpis", {}).get("tests_per_fte", {}) or {}
    fte_hours_per_day = tpf_cfg.get("hours_per_fte_day", tpf_cfg.get("baseline_per_fte_per_day", 8))
    if productivity:
        total_hours = _sum_hours_productivity(productivity, s, e)
        if total_hours and fte_hours_per_day:
            fte_equivalents = total_hours / float(fte_hours_per_day)
            if fte_equivalents > 0:
                tests_per_fte = total_volume / fte_equivalents

    # --- Build result ---
    result = {
        "meta": {
            "period": {"start_date": period_obj.start_date, "end_date": period_obj.end_date},
            "generatedAt": datetime.utcnow().isoformat() + "Z",
            "config_version": config.get("metadata", {}).get("version"),
        },
        "metrics": {
            "cytogenetics_total_volume": {
                "total": cyto_total,
                "status": volume_status(cyto_total, "cytogenetics_total_volume"),
            },
            "total_volume": {"total": total_volume},
            "tat": tat_agg,
            "percent_change": {"mom": mom, "yoy": yoy},
            "tests_per_fte": {
                "tests": total_volume,
                "total_hours": total_hours,
                "fte_equivalents": fte_equivalents,
                "hours_per_fte_day": fte_hours_per_day,
                "value": tests_per_fte,
            },
        },
    }

    # Logging & Monitoring: emit warnings/errors for threshold breaches (no PHI)
    try:
        cyto_status = result["metrics"]["cytogenetics_total_volume"]["status"]
        tat_status_val = result["metrics"]["tat"]["status"]

        if cyto_status in {"warning", "critical"}:
            msg = (
                f"KPI cytogenetics_total_volume {cyto_status}: total={cyto_total} "
                f"period={period_obj.start_date}..{period_obj.end_date}"
            )
            if cyto_status == "critical":
                logger.error(msg)
            else:
                logger.warning(msg)

        if tat_status_val in {"warning", "critical"}:
            tat_avg = result["metrics"]["tat"].get("avg_hours")
            tat_count = result["metrics"]["tat"].get("count")
            msg = (
                f"KPI TAT {tat_status_val}: avg_hours={tat_avg} count={tat_count} "
                f"period={period_obj.start_date}..{period_obj.end_date}"
            )
            if tat_status_val == "critical":
                logger.error(msg)
            else:
                logger.warning(msg)
    except Exception:
        # Never fail KPI compute due to logging issues
        pass

    return result
