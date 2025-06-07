from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging
import sys
from contextlib import asynccontextmanager

from .routers import pages, config_router # Import the routers
from .database import create_db_and_tables # Import DB initialization function
from .config import settings
from .services.memory_service import initialize_mem0_client
from .services.llm_service import initialize_gemini_model

# Configure logging
logging.basicConfig(
    level=logging.INFO if settings.DEBUG_MODE else logging.WARNING,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    try:
        # Startup
        await create_db_and_tables()
        logger.info("Database tables created successfully")

        initialize_mem0_client()
        logger.info("Mem0 client initialized successfully")

        initialize_gemini_model()
        logger.info("Gemini model initialized successfully")

        logger.info(f"{settings.APP_NAME} v{settings.APP_VERSION} starting up...")
        yield
    except Exception as e:
        logger.error(f"Error during startup: {e}", exc_info=True)
        raise
    finally:
        # Shutdown
        logger.info(f"{settings.APP_NAME} shutting down...")

app = FastAPI(
    title=settings.APP_NAME,
    description="API for the Smart Read Mode Chrome Extension.",
    version=settings.APP_VERSION,
    docs_url="/docs" if settings.DEBUG_MODE else None,
    redoc_url="/redoc" if settings.DEBUG_MODE else None,
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins for MVP, adjust for production
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Handle HTTP exceptions and return JSON responses."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle unexpected exceptions and return JSON responses."""
    logger.error(f"Unexpected error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred"},
    )

@app.get("/", tags=["Root"])
async def read_root():
    """Root endpoint returning basic API information."""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs_url": "/docs" if settings.DEBUG_MODE else None,
    }

@app.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
    }

# Placeholder for other potential global configurations or initializations

# Include routers
app.include_router(pages.router, prefix="/api/v1/pages", tags=["Pages"])
app.include_router(config_router.router, prefix="/api/v1/config", tags=["Configuration"])
