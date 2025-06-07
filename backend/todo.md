# Smart Read Mode API - TODO & Considerations

This document lists pending tasks, areas for improvement, and important considerations to make the current MVP implementation more robust and production-ready.

## I. Core Functionality & Logic Refinements:

1.  **`mem0` SDK Integration (`app/services/memory_service.py`):**
    *   **Client Initialization:** The current `mem0_client = Memory()` initialization is basic. Verify the exact configuration method required by the `mem0` SDK (e.g., passing API keys, Qdrant details directly, or if it relies solely on environment variables). Implement robust error handling and potentially a health check for the `mem0` connection on startup.
    *   **Response Parsing:** The `add_to_memory` and `search_memory` functions make assumptions about the structure of the `mem0` SDK's responses (e.g., how `mem0_id` is returned, structure of search results). These need to be validated against the actual SDK behavior and adjusted for reliability. Specifically, ensure `id`, `text`/`content`, `score`, and `metadata` are correctly extracted from search results.
    *   **User Context:** The current implementation assumes a single-user context for `mem0`. If `mem0` supports multi-tenancy or user-specific data isolation at the SDK level (e.g., via a `user_id` parameter in `add` or `search`), this needs to be integrated.

2.  **Gemini LLM Integration (`app/services/llm_service.py`):**
    *   **Batch Response Parsing:** The `rephrase_batch` function's logic for parsing the batched response from Gemini is a placeholder and highly dependent on the LLM's output format. This is a **critical area for refinement**.
        *   Experiment with different prompt structures to encourage Gemini to return easily parsable, structured output (e.g., JSON, or a very consistent delimited list).
        *   Implement robust parsing logic to accurately map rephrased/summarized content back to the correct original chunks.
    *   **Context Window Management:** If the combined text of "seen" chunks is too large for Gemini's context window, the current plan mentions batching. This batching logic (splitting `seen_chunks_for_gemini` into smaller groups for multiple Gemini calls) needs to be implemented.
    *   **Error Handling:** Enhance error handling for individual segments within a batch. If Gemini fails to process one segment in a batch, how should it be handled? Should it return `None` for that segment or attempt a retry?
    *   **Model Selection:** Currently uses `gemini-1.5-flash-latest`. Evaluate if this is the optimal model for cost, speed, and quality for rephrasing/summarization tasks.

3.  **Database Operations (`app/routers/pages.py`, `app/routers/config_router.py`):**
    *   **Asynchronous Operations:** Currently using synchronous SQLAlchemy Core operations (`engine.connect()`). For a production FastAPI app, consider switching to an asynchronous database driver (e.g., `asyncpg` for PostgreSQL, `aiosqlite` for SQLite) and use `AsyncSession` with `async/await` for all database calls to prevent blocking the event loop. This would require changes in `database.py` and how sessions are handled in routers (e.g., using `Depends` for an async session).
    *   **Transaction Management:** Ensure database operations (especially those involving multiple inserts/updates like in `pages.py`) are wrapped in transactions to maintain data integrity. The current `connection.commit()` is a good start, but more complex scenarios might need explicit `connection.begin()`.
    *   **Error Handling:** Improve specificity of database error handling.

4.  **Configuration Management (`app/config.py`, `app/routers/config_router.py`):**
    *   **Loading from `.env`:** Uncomment and test loading configurations from a `.env` file for better security and environment management.
    *   **Sensitive Data:** For production, ensure sensitive keys (like API keys) are handled securely (e.g., not logged, potentially encrypted at rest if stored in DB, though `.env` is preferred for keys). The `ConfigItem` response for `GET /config/` currently returns all values; consider masking sensitive ones.

5.  **Chunking Strategy (`app/services/content_processor.py`):**
    *   **Parameter Tuning:** The `chunk_size` and `chunk_overlap` for `RecursiveCharacterTextSplitter` are currently defaults. These should be tuned based on the embedding model used by `mem0` and the context window of Gemini for optimal performance and coherence.
    *   **Alternative Strategies:** Explore other Langchain splitters or custom logic if `RecursiveCharacterTextSplitter` isn't ideal for all content types.

6.  **Similarity Threshold (`app/config.py`):**
    *   The `SIMILARITY_THRESHOLD` (default 0.90) for determining "seen" chunks is critical. This value needs to be empirically tested and tuned to balance accurately identifying previously seen content versus flagging slightly modified content as new. It might even become a user-configurable setting.

## II. Setup & Dependencies:

1.  **`pyproject.toml`:**
    *   Create/update `pyproject.toml` to include all necessary dependencies:
        *   `fastapi`
        *   `uvicorn[standard]` (for running the server)
        *   `sqlalchemy`
        *   `pydantic`
        *   `pydantic-settings`
        *   `mem0` (ensure correct package name and version)
        *   `google-generativeai`
        *   `langchain`
        *   `python-dotenv` (if using `.env` files)
        *   `aiosqlite` (if switching to async SQLite)
2.  **`.env_example` File:**
    *   Create a `.env_example` file listing required environment variables like `GEMINI_API_KEY`, `MEM0_API_KEY` (if any), `QDRANT_HOST`, `QDRANT_PORT`, etc.
3.  **`README.md`:**
    *   Write a `README.md` with:
        *   Project overview.
        *   Setup instructions (creating virtual environment, installing dependencies, setting up `.env`).
        *   Instructions on how to run the FastAPI server (e.g., `uvicorn app.main:app --reload`).
        *   Basic API usage examples (e.g., how to POST to `/api/v1/pages/process`).

## III. Testing & Validation:

1.  **Unit Tests:** Write unit tests for individual functions and services:
    *   Chunking logic in `content_processor.py`.
    *   Mocked tests for `memory_service.py` and `llm_service.py` (mocking external SDK calls).
    *   Database interaction logic (if abstracted into helper functions).
2.  **Integration Tests:** Test the interaction between services and the API endpoints.
    *   Test the full flow of the `/api/v1/pages/process` endpoint with sample data.
    *   Test configuration endpoints.
3.  **Manual Testing:**
    *   Use tools like Postman or `curl` to send requests to the running API and verify responses.
    *   Test with various types of text content to see how chunking, novelty detection, and rephrasing perform.
    *   Verify database entries are created/updated correctly.
    *   Test edge cases (empty content, very long content, special characters).

## IV. Production Considerations (Future):

*   **Error Monitoring & Logging:** Integrate a proper logging framework (e.g., Python's `logging` module configured for FastAPI) and potentially an error monitoring service (e.g., Sentry).
*   **Authentication & Authorization:** The current MVP is open. For real-world use, implement user authentication (e.g., OAuth2) to secure endpoints and associate data with specific users.
*   **Scalability:**
    *   Consider if SQLite will be sufficient for the expected load or if a more robust database like PostgreSQL (with `asyncpg`) is needed.
    *   Evaluate Qdrant deployment and scaling.
    *   FastAPI can be scaled using multiple worker processes with Uvicorn/Gunicorn.
*   **Security:** Review all dependencies for vulnerabilities, implement input validation thoroughly, protect against common web vulnerabilities.
*   **Deployment:** Plan for deployment (e.g., Docker, serverless platform, VM).

## V. Things to be Aware Of:

*   **`mem0` SDK Behavior:** The current implementation makes assumptions about the `mem0` SDK's API (method names, parameters, response structures). **This is the area most likely to require changes once the actual SDK is integrated and tested.**
*   **Gemini API Behavior:** Similarly, the prompt engineering and response parsing for batched requests to Gemini are based on general LLM interaction patterns. Actual output from Gemini might require significant adjustments to the parsing logic in `llm_service.py`. Test this thoroughly.
*   **Rate Limits:** Be mindful of API rate limits for both `mem0` (if it calls external services) and Google Gemini. Implement retries or queuing if necessary.
*   **Cost:** Calls to Gemini API incur costs. The holistic call approach aims to reduce calls, but processing large amounts of text can still be expensive. Consider strategies for cost control (e.g., user-configurable rephrasing, caching).
*   **Synchronous DB Calls:** The current use of synchronous SQLAlchemy Core with `engine.connect()` in async FastAPI routes can block the event loop under load. Migrating to async database drivers and sessions is a key performance improvement for production.
*   **Dependency Management:** Ensure all dependencies are pinned to specific versions in `pyproject.toml` for reproducible builds.

This TODO list should provide a good roadmap for solidifying the MVP and planning future enhancements.
