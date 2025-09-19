import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

import yaml

logger = logging.getLogger(__name__)

DEFAULT_CONFIG_RELATIVE = Path("config") / "kpi_config.yaml"


def _resolve_default_config_path() -> Path:
    """
    Resolve path to config/kpi_config.yaml relative to project root.
    Falls back to searching upwards from this file location.
    """
    # If explicitly provided, use it
    env_path = os.getenv("KPI_CONFIG_PATH")
    if env_path:
        p = Path(env_path).expanduser().resolve()
        return p

    # Try repo layout: <project_root>/config/kpi_config.yaml
    here = Path(__file__).resolve()
    # __file__ => backend/app/kpi/config_loader.py
    # project root is parents[3]
    candidates = [
        here.parents[3] / DEFAULT_CONFIG_RELATIVE,  # <root>/config/kpi_config.yaml
        here.parents[2] / DEFAULT_CONFIG_RELATIVE,  # <backend>/config/kpi_config.yaml (unlikely)
        Path.cwd() / DEFAULT_CONFIG_RELATIVE,       # CWD-relative when running locally
    ]
    for c in candidates:
        if c.exists():
            return c

    # As last resort, return the first candidate (even if missing) so caller gets a clear error
    return candidates[0]


@lru_cache(maxsize=1)
def load_kpi_config() -> Dict[str, Any]:
    """Load and cache KPI config YAML.

    Returns a dictionary with keys like 'kpis' and 'metadata'.
    Raises FileNotFoundError or yaml.YAMLError on failure.
    """
    path = _resolve_default_config_path()
    if not path.exists():
        raise FileNotFoundError(f"KPI config not found at: {path}")

    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}

    logger.info("Loaded KPI config from %s (version=%s)", path, data.get("metadata", {}).get("version"))
    # Attach resolved path for debugging
    data.setdefault("_source_path", str(path))
    return data
