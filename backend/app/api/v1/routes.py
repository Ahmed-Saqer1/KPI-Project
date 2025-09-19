from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import Settings
from app.kpi import load_kpi_config, compute_kpis
from app.integrations.powerbi import get_embed_info
from app.core.log_store import get_recent_logs

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
def health():
    """Basic health endpoint for uptime checks and frontend handshake."""
    return {
        "status": "ok",
        "service": Settings.PROJECT_NAME,
        "version": Settings.APP_VERSION,
        "time": datetime.now(timezone.utc).isoformat(),
    }

# -------------------- KPI Engine --------------------

class KPIComputePeriod(BaseModel):
    start_date: str = Field(..., description="YYYY-MM-DD")
    end_date: str = Field(..., description="YYYY-MM-DD")


class KPIComputeRequest(BaseModel):
    period: KPIComputePeriod
    tests: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="List of test records with fields like type/category, subtype, received_at, resulted_at",
    )
    productivity: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Optional productivity entries (date, hours_worked/remote_hours/in_lab_hours)",
    )


class KPIConfigOut(BaseModel):
    config: Dict[str, Any]


@router.get("/kpi/config", response_model=KPIConfigOut)
def kpi_get_config():
    try:
        cfg = load_kpi_config()
        # Do not expose internal keys starting with underscore
        sanitized = {k: v for k, v in cfg.items() if not str(k).startswith("_")}
        return {"config": sanitized}
    except FileNotFoundError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load KPI config")


@router.post("/kpi/compute")
def kpi_compute(req: KPIComputeRequest):
    try:
        cfg = load_kpi_config()
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load KPI config")

    productivity_items: Optional[List[Dict[str, Any]]] = req.productivity

    try:
        result = compute_kpis(
            cfg,
            period=req.period,  # type: ignore[arg-type]
            tests=list(req.tests),
            productivity=productivity_items,
        )
        logger.info(
            "API kpi_compute ok: tests=%s productivity_items=%s",
            len(req.tests or []),
            0 if productivity_items is None else len(productivity_items),
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="KPI computation failed")


# -------------------- PowerBI Integration --------------------


@router.get("/powerbi/embed-info")
def powerbi_embed_info():
    try:
        info = get_embed_info()
        return info
    except ValueError as e:
        # Likely not configured
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="PowerBI embed info failed")


# -------------------- Logging & Monitoring --------------------


@router.get("/logs")
def get_logs(limit: int = 100, level: Optional[str] = None, since: Optional[str] = None):
    # Clamp limit for safety
    lim = 1 if limit <= 0 else min(500, limit)
    try:
        items = get_recent_logs(limit=lim, level=level, since=since)
        logger.info(
            "API logs fetch ok: limit=%s level=%s since=%s returned=%s",
            lim, level, since, len(items)
        )
        return {"items": items, "count": len(items)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to fetch logs")
