import os


class Settings:
    """Simple settings for the API.

    Keep environment-variable driven configuration minimal in MVP.
    """

    PROJECT_NAME = "Cytogenetics KPI API"
    API_V1_STR = "/api/v1"
    APP_VERSION = os.getenv("APP_VERSION", "0.1.0")
    BACKEND_CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv("BACKEND_CORS_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    ]

    # --- Logging & Monitoring ---
    LOG_BUFFER_CAPACITY = int(os.getenv("LOG_BUFFER_CAPACITY", "1000"))

    # --- PowerBI Integration ---
    # These are used by the PowerBI integration module to authenticate and fetch embed info
    PBI_TENANT_ID = os.getenv("PBI_TENANT_ID", "")
    PBI_CLIENT_ID = os.getenv("PBI_CLIENT_ID", "")
    PBI_CLIENT_SECRET = os.getenv("PBI_CLIENT_SECRET", "")
    PBI_WORKSPACE_ID = os.getenv("PBI_WORKSPACE_ID", "")
    PBI_REPORT_ID = os.getenv("PBI_REPORT_ID", "")
    PBI_SCOPE = os.getenv(
        "PBI_SCOPE", "https://analysis.windows.net/powerbi/api/.default"
    )
