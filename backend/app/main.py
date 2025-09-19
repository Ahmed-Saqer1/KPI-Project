import logging

from dotenv import load_dotenv

# Load .env as early as possible for local development
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import Settings
from app.api.v1.routes import router as api_router
from app.core.log_store import init_logging_buffer

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title=Settings.PROJECT_NAME,
    version=Settings.APP_VERSION,
    openapi_url=f"{Settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=Settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=Settings.API_V1_STR)


@app.get("/")
def root():
    return {
        "message": "Cytogenetics KPI API",
        "docs": "/docs",
        "health": f"{Settings.API_V1_STR}/health",
    }


@app.on_event("startup")
async def startup_event():
    logger.info("Starting API: %s v%s", Settings.PROJECT_NAME, Settings.APP_VERSION)
    try:
        init_logging_buffer(Settings.LOG_BUFFER_CAPACITY)
        logger.info("Log buffer initialized: capacity=%s", Settings.LOG_BUFFER_CAPACITY)
    except Exception as e:
        logger.warning("Failed to initialize log buffer: %s", e)
