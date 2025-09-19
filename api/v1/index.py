# Vercel Serverless entrypoint for FastAPI app
# This file exposes the existing FastAPI app (backend/app/main.py) to Vercel's Python runtime.

import os
import sys
from pathlib import Path

# Resolve project root and make backend importable
# This file resides at <root>/api/v1/index.py
ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Ensure KPI config path is available inside the serverless function bundle
# (config/kpi_config.yaml is included via vercel.json -> functions.includeFiles)
DEFAULT_CFG = ROOT_DIR / "config" / "kpi_config.yaml"
os.environ.setdefault("KPI_CONFIG_PATH", str(DEFAULT_CFG))

# Import the FastAPI application from the backend
from app.main import app as fastapi_app  # noqa: E402

class _PrefixPathMiddleware:
    """
    ASGI middleware that prefixes the PATH so that when Vercel strips the function's
    base path (e.g., '/api/v1'), our FastAPI app still receives '/api/v1/...'.

    Without this, a request to '/api/v1/health' would arrive to the ASGI app as
    '/health', which won't match because the backend mounts the router at '/api/v1'.
    """

    def __init__(self, app, prefix: str = "/api/v1"):
        self.app = app
        self.prefix = prefix.rstrip("/")

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            # Shallow copy scope and adjust path
            new_scope = dict(scope)
            path = new_scope.get("path", "") or ""
            # Allow root and docs paths (and their static assets) to pass through
            # unmodified so backend '/' and '/docs' work at '/api/v1' endpoint.
            if path == "/" or path.startswith("/docs") or path.startswith("/redoc"):
                return await self.app(new_scope, receive, send)
            # Avoid double-prefix if path already contains the prefix
            if not path.startswith(self.prefix):
                new_scope["path"] = f"{self.prefix}{path}"
            return await self.app(new_scope, receive, send)
        return await self.app(scope, receive, send)

# Expose as `app` for Vercel (ASGI callable) with path prefix fix
app = _PrefixPathMiddleware(fastapi_app, "/api/v1")
