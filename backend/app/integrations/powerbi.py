import os
import logging
from dataclasses import dataclass
from typing import Dict, Optional

import requests
try:
    import msal  # type: ignore
except Exception as e:  # pragma: no cover
    msal = None  # Allow import-time failure; runtime will error clearly


logger = logging.getLogger(__name__)

PBI_API_BASE = "https://api.powerbi.com/v1.0/myorg"
PBI_DEFAULT_SCOPE = "https://analysis.windows.net/powerbi/api/.default"


@dataclass
class PowerBISettings:
    tenant_id: str
    client_id: str
    client_secret: str
    workspace_id: str
    report_id: str
    scope: str = PBI_DEFAULT_SCOPE

    @property
    def authority(self) -> str:
        return f"https://login.microsoftonline.com/{self.tenant_id.strip()}"

    def is_configured(self) -> bool:
        return all([
            self.tenant_id, self.client_id, self.client_secret,
            self.workspace_id, self.report_id,
        ])


def get_config_from_env() -> PowerBISettings:
    return PowerBISettings(
        tenant_id=os.getenv("PBI_TENANT_ID", ""),
        client_id=os.getenv("PBI_CLIENT_ID", ""),
        client_secret=os.getenv("PBI_CLIENT_SECRET", ""),
        workspace_id=os.getenv("PBI_WORKSPACE_ID", ""),
        report_id=os.getenv("PBI_REPORT_ID", ""),
        scope=os.getenv("PBI_SCOPE", PBI_DEFAULT_SCOPE),
    )


def _access_token(cfg: PowerBISettings) -> str:
    if msal is None:  # pragma: no cover
        raise RuntimeError("msal is not installed. Please add 'msal' to requirements and install it.")
    app = msal.ConfidentialClientApplication(
        client_id=cfg.client_id,
        authority=cfg.authority,
        client_credential=cfg.client_secret,
    )
    result = app.acquire_token_for_client(scopes=[cfg.scope])
    if not result or "access_token" not in result:
        err = result.get("error_description") if isinstance(result, dict) else None
        raise RuntimeError(f"Failed to acquire PowerBI access token: {err}")
    return str(result["access_token"])


def _headers(token: str) -> Dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _get_report_details(cfg: PowerBISettings, token: str) -> Dict[str, str]:
    url = f"{PBI_API_BASE}/groups/{cfg.workspace_id}/reports/{cfg.report_id}"
    resp = requests.get(url, headers=_headers(token), timeout=20)
    if resp.status_code >= 300:
        raise RuntimeError(f"PowerBI report fetch failed: {resp.status_code} {resp.text}")
    data = resp.json() or {}
    embed_url = data.get("embedUrl")
    dataset_id = data.get("datasetId")
    if not embed_url:
        raise RuntimeError("PowerBI: embedUrl missing from report details")
    return {"embedUrl": embed_url, "datasetId": dataset_id or ""}


def _generate_embed_token(cfg: PowerBISettings, token: str) -> Dict[str, str]:
    # Generate a report-scoped embed token (View)
    url = f"{PBI_API_BASE}/groups/{cfg.workspace_id}/reports/{cfg.report_id}/GenerateToken"
    payload = {"accessLevel": "View"}
    resp = requests.post(url, headers=_headers(token), json=payload, timeout=20)
    if resp.status_code >= 300:
        raise RuntimeError(f"PowerBI token generation failed: {resp.status_code} {resp.text}")
    data = resp.json() or {}
    tok = data.get("token")
    exp = data.get("expiration")
    if not tok:
        raise RuntimeError("PowerBI: token missing from GenerateToken response")
    return {"token": tok, "expiration": exp or ""}


def get_embed_info(cfg: Optional[PowerBISettings] = None) -> Dict[str, str]:
    """Return dict with embedUrl, reportId, token, expiration.

    Raises RuntimeError on failures. Callers should convert to HTTP errors.
    """
    _cfg = cfg or get_config_from_env()
    if not _cfg.is_configured():
        raise ValueError("PowerBI configuration missing. Set PBI_TENANT_ID, PBI_CLIENT_ID, PBI_CLIENT_SECRET, PBI_WORKSPACE_ID, PBI_REPORT_ID.")

    token = _access_token(_cfg)
    details = _get_report_details(_cfg, token)
    gen = _generate_embed_token(_cfg, token)

    result = {
        "embedUrl": details["embedUrl"],
        "reportId": _cfg.report_id,
        "token": gen["token"],
        "expiration": gen["expiration"],
    }
    logger.info("PowerBI embed info issued: report=%s workspace=%s exp=%s", _cfg.report_id, _cfg.workspace_id, result.get("expiration"))
    return result
