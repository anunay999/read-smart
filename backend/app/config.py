from pydantic_settings import BaseSettings
from typing import Optional, Dict, Any

class Settings(BaseSettings):
    # Application settings
    APP_NAME: str = "Smart Read Mode API"
    APP_VERSION: str = "0.1.0"
    DEBUG_MODE: bool = False # Set to True for development debugging

    # Database settings (SQLite for MVP)
    DATABASE_URL: str = "sqlite:///./smart_read_mode.db"

    # Mem0 / Qdrant settings (placeholders, to be configured via API or .env)
    MEM0_API_KEY: Optional[str] = None
    QDRANT_HOST: Optional[str] = "localhost"
    QDRANT_PORT: Optional[int] = 6333
    QDRANT_COLLECTION_NAME: str = "smart_read_memories"
    # Similarity threshold for determining "seen" chunks
    SIMILARITY_THRESHOLD: float = 0.90


    # Gemini LLM settings (placeholders, to be configured via API or .env)
    GEMINI_API_KEY: Optional[str] = None

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True

settings = Settings()

def get_mem0_config() -> Dict[str, Any]:
    """Get Mem0 configuration dictionary."""
    return {
        "api_key": settings.MEM0_API_KEY,
        "vector_store": {
            "provider": "qdrant",
            "config": {
                "host": settings.QDRANT_HOST,
                "port": settings.QDRANT_PORT,
                "collection_name": settings.QDRANT_COLLECTION_NAME,
            }
        }
    }

def get_gemini_config() -> Dict[str, Any]:
    """Get Gemini configuration dictionary."""
    return {
        "api_key": settings.GEMINI_API_KEY,
        "model": "gemini-1.5-flash-latest",
        "temperature": 0.7,
        "max_output_tokens": 2048,
    }

def get_database_config() -> Dict[str, Any]:
    """Get database configuration dictionary."""
    return {
        "url": settings.DATABASE_URL,
        "echo": settings.DEBUG_MODE,
    }
