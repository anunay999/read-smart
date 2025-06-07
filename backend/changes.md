# Project Setup: Smart Read Mode API - Changes Made

This document outlines the initial project structure and files created for the Smart Read Mode API, based on the plan in `architecture.md`.

## Directory Structure Created:

```
/read-smart-backend/
|-- app/
|   |-- __init__.py
|   |-- main.py
|   |-- config.py
|   |-- database.py
|   |-- schemas.py
|   |-- routers/
|   |   |-- __init__.py
|   |   |-- pages.py
|   |   |-- config_router.py
|   |-- services/
|   |   |-- __init__.py
|   |   |-- content_processor.py
|   |   |-- memory_service.py
|   |   |-- llm_service.py
|   |-- utils/
|   |   |-- __init__.py
|-- architecture.md  (Previously created planning document)
|-- changes.md       (This file)
|-- todo.md          (To be created)
```

## Files Created and Their Purpose:

### 1. `app/__init__.py`
*   **Purpose:** Makes the `app` directory a Python package, allowing for relative imports within the application.
*   **Content:** Contains a comment indicating its purpose.

### 2. `app/main.py`
*   **Purpose:** The main entry point for the FastAPI application.
*   **Content:**
    *   Initializes the `FastAPI` app instance with title, description, and version.
    *   Configures CORS (Cross-Origin Resource Sharing) middleware to allow requests (currently set to all origins for MVP).
    *   Defines `on_startup` event handler:
        *   Calls `create_db_and_tables()` from `app.database` to ensure database tables are created when the app starts.
        *   Includes placeholder print statements and comments for further initializations (e.g., mem0 client, configurations).
    *   Defines `on_shutdown` event handler (placeholder).
    *   Imports and includes API routers from `app.routers.pages` and `app.routers.config_router` with appropriate prefixes and tags.
    *   Includes a root GET endpoint (`/`) for basic API health check/welcome message.

### 3. `app/config.py`
*   **Purpose:** Manages application settings and configurations.
*   **Content:**
    *   Uses `pydantic-settings.BaseSettings` to define a `Settings` class.
    *   Includes default application settings (`APP_NAME`, `APP_VERSION`, `DEBUG_MODE`).
    *   Defines `DATABASE_URL` for SQLite.
    *   Includes placeholder settings for `mem0` / Qdrant (`MEM0_API_KEY`, `QDRANT_HOST`, `QDRANT_PORT`, `QDRANT_COLLECTION_NAME`) and the `SIMILARITY_THRESHOLD`.
    *   Includes placeholder for `GEMINI_API_KEY`.
    *   Configuration for loading from a `.env` file is commented out but available.
    *   Instantiates `settings = Settings()`.
    *   Placeholder comments for helper functions to retrieve specific configurations.

### 4. `app/database.py`
*   **Purpose:** Handles database setup, connection, and table definitions.
*   **Content:**
    *   Imports `sqlalchemy` components.
    *   Uses `DATABASE_URL` from `app.config`.
    *   Creates a SQLAlchemy `engine` for SQLite (with `check_same_thread=False`).
    *   Defines `metadata = MetaData()`.
    *   Defines SQLAlchemy Core `Table` objects for:
        *   `WebPages`: Stores URL, title, processed timestamp, content hash.
        *   `ContentChunks`: Stores page ID, `mem0_id`, text preview, order, creation timestamp.
        *   `UserReadHistory`: Tracks `mem0_chunk_id`, first/last seen page IDs and timestamps, seen count.
        *   `Configurations`: Key-value store for system settings.
    *   Defines `create_db_and_tables()` function to create all defined tables if they don't exist, called from `app.main` on startup.

### 5. `app/schemas.py`
*   **Purpose:** Defines Pydantic models for API request/response validation and data serialization.
*   **Content:**
    *   `PageProcessRequest`: For the `/pages/process` endpoint, expects `url` (HttpUrl), `text_content` (str), and optional `title`.
    *   `ChunkOutput`: Defines the structure for individual processed chunks in the response (original text, status, processed text, source URL, order).
    *   `PageProcessResponse`: Defines the overall response for `/pages/process` (page URL, title, list of `ChunkOutput`).
    *   `ConfigItemBase`, `ConfigItemCreate`, `ConfigItemUpdate`, `ConfigItem`: Schemas for configuration management (key, value, updated_at).
    *   `ConfigUpdateRequest`: For updating multiple configurations in one request.
    *   Placeholder schemas for database models (`WebPageSchema`, `ContentChunkSchema`, `UserReadHistorySchema`) for potential future use if returning full DB objects directly.

### 6. `app/routers/__init__.py`
*   **Purpose:** Makes the `routers` directory a Python package.
*   **Content:** Contains a comment indicating its purpose.

### 7. `app/routers/pages.py`
*   **Purpose:** Defines API endpoints related to page processing.
*   **Content:**
    *   Creates an `APIRouter` instance.
    *   Defines the `POST /process` endpoint (`/api/v1/pages/process`):
        *   Takes `schemas.PageProcessRequest` as input.
        *   **WebPage Metadata:** Inserts or updates the `WebPages` table with URL and title.
        *   **Chunking:** Calls `content_processor.chunk_text()` to split the input `text_content`.
        *   **Chunk Processing Loop:**
            *   Iterates through each chunk.
            *   Calls `memory_service.search_memory()` to check if the chunk is "seen" based on `settings.SIMILARITY_THRESHOLD`.
            *   If "seen": Updates `UserReadHistory`, collects chunk data for Gemini.
            *   If "new": Calls `memory_service.add_to_memory()` (with metadata like `original_url`, `page_id`, `order_in_page`), stores new `ContentChunks` and `UserReadHistory` entries.
            *   Populates `final_chunk_outputs_map` with chunk status and details.
        *   **Holistic Gemini Call:** If "seen" chunks exist, calls `llm_service.rephrase_batch()` with collected data.
        *   Updates `final_chunk_outputs_map` with rephrased text and "summarized" status from Gemini's response.
        *   Constructs and returns `schemas.PageProcessResponse` with sorted chunks.

### 8. `app/routers/config_router.py`
*   **Purpose:** Defines API endpoints for managing system configurations.
*   **Content:**
    *   Creates an `APIRouter` instance.
    *   `GET /`: Retrieves all configurations from the `Configurations` table.
    *   `PUT /`: Updates or adds new configurations. Iterates through the request list, checks if a key exists, then updates or inserts accordingly. Commits changes and returns the full updated list.
    *   `GET /{config_key}`: Retrieves a specific configuration item by its key.

### 9. `app/services/__init__.py`
*   **Purpose:** Makes the `services` directory a Python package.
*   **Content:** Contains a comment indicating its purpose and listing planned services.

### 10. `app/services/content_processor.py`
*   **Purpose:** Handles the logic for chunking text content.
*   **Content:**
    *   Implements `chunk_text_with_langchain()` using `langchain.text_splitter.RecursiveCharacterTextSplitter`.
    *   Provides a main `chunk_text()` function that defaults to the Langchain strategy.
    *   Includes configurable `chunk_size` and `chunk_overlap`.
    *   Includes an `if __name__ == '__main__':` block for direct testing of the chunking.

### 11. `app/services/memory_service.py`
*   **Purpose:** Encapsulates interactions with the `mem0` SDK.
*   **Content:**
    *   Initializes a `mem0_client` (currently `mem0.Memory()`, assuming default configuration or environment variables). Includes basic error handling for initialization.
    *   `add_to_memory()`: Adds a text chunk with specified metadata to `mem0`. Handles response parsing to get the `mem0_id`.
    *   `search_memory()`: Searches `mem0` for a query text, returns a list of results including ID, text, score, and metadata.
    *   Includes placeholder for direct testing.

### 12. `app/services/llm_service.py`
*   **Purpose:** Handles interactions with the Google Gemini LLM.
*   **Content:**
    *   Configures the `genai` client using `settings.GEMINI_API_KEY`.
    *   `get_gemini_model()`: Lazily initializes and returns a Gemini model instance (`gemini-1.5-flash-latest`).
    *   `rephrase_batch()`:
        *   Takes a list of "seen" chunk data.
        *   Constructs a single prompt instructing Gemini to rephrase/summarize each segment.
        *   Makes an asynchronous call to `model.generate_content_async()`.
        *   Includes placeholder logic for parsing Gemini's batched response (this part is noted as needing significant refinement based on actual LLM output).
    *   Includes placeholder for direct testing.

### 13. `app/utils/__init__.py`
*   **Purpose:** Makes the `utils` directory a Python package for helper functions.
*   **Content:** Contains a comment indicating its purpose.

This setup provides the foundational structure for the API as per the refined plan.
