# OpenMemory API - Technical Architecture

## 1. Overview

The OpenMemory API is a backend service built with Python and FastAPI. It provides functionalities for storing, managing, searching, and categorizing user memories. It also allows applications (clients) to interact with these memories. The API uses a PostgreSQL database (implied by SQLAlchemy and Alembic usage) for persistence and interacts with an external "memory client" (likely `mem0` and a vector database like Qdrant) for advanced memory operations like semantic search and an LLM for categorization.

The API also exposes an MCP (Model Context Protocol) server, allowing programmatic access to memory functionalities for integrated tools or agents.

## 2. Core Technologies

-   **Framework**: FastAPI
-   **Database**: SQL-based (likely PostgreSQL), accessed via SQLAlchemy ORM.
-   **Migrations**: Alembic (inferred from `alembic.ini` and version files).
-   **Data Validation/Serialization**: Pydantic.
-   **Memory Backend**: External service/library (referred to as "memory client", e.g., `mem0`), which likely handles vector embeddings and semantic search (e.g., using Qdrant).
-   **Categorization**: External LLM (called via `get_categories_for_memory`).
-   **Asynchronous Operations**: Leverages FastAPI's async capabilities.
-   **MCP Server**: Implemented using `mcp.server.fastmcp` and `mcp.server.sse`.

## 3. Project Structure (API - `/api`)

-   **`main.py`**: Entry point of the FastAPI application. Initializes DB, routers, middleware, default user/app, and MCP server.
-   **`database.py`**: SQLAlchemy engine setup, `SessionLocal`, and `Base` for models.
-   **`config.py` (in `/api/app/`)**: Basic app config like default `USER_ID` and `DEFAULT_APP_ID`.
-   **`models.py`**: Defines SQLAlchemy ORM models for database tables.
-   **`schemas.py`**: Defines Pydantic models for API request/response validation and data shapes.
-   **`routers/`**: Contains API endpoint definitions.
    -   `apps.py`: Endpoints for managing applications/clients.
    -   `config.py`: Endpoints for managing system configurations (LLM, embedders, etc.).
    -   `memories.py`: Endpoints for managing memories.
    -   `stats.py`: Endpoints for user statistics.
-   **`utils/`**: Utility functions.
    -   `categorization.py`: Logic for memory categorization.
    -   `db.py`: Database helper functions.
    -   `memory.py`: Functions to interact with the external memory client.
    -   `permissions.py`: Access control logic.
-   **`mcp_server.py`**: Implements the MCP server and its tools.
-   **`alembic/`**: Database migration scripts.

## 4. Database Schema (`models.py`)

-   **`User`**: Stores user information (ID, name, email, metadata).
-   **`App`**: Represents client applications that interact with memories (ID, owner, name, description, active status).
-   **`Config`**: A generic key-value store for application configurations.
    -   Fields: `id` (UUID), `key` (String, unique, e.g., "main", "llm", "embedder"), `value` (JSON, stores the actual configuration object), `created_at`, `updated_at`.
    -   Used to store various system settings like LLM provider details, embedding model configurations, and OpenMemory/`mem0` specific settings.
-   **`Memory`**: The central table for storing memories.
    -   Fields: `id` (UUID), `user_id` (ForeignKey to `User`), `app_id` (ForeignKey to `App`), `content` (String, the textual content of the memory), `vector` (String, likely stores a reference or representation of the embedding vector), `metadata_` (JSON, for arbitrary additional data), `state` (Enum: `active`, `paused`, `archived`, `deleted`), `created_at`, `updated_at`, `archived_at`, `deleted_at`.
    -   Relationships: Many-to-one with `User` and `App`. Many-to-many with `Category`.
    -   Event Listeners: Triggers automatic categorization (`categorize_memory`) on insert and update.
-   **`Category`**: Stores category names and descriptions.
    -   Fields: `id`, `user_id`, `app_id`, `content` (text), `vector` (embedding representation), `metadata_`, `state` (active, paused, archived, deleted), timestamps.
    -   Relationships: Many-to-one with `User` and `App`. Many-to-many with `Category`.
    -   Event Listeners: Triggers automatic categorization (`categorize_memory`) on insert and update.
-   **`Category`**: Stores category names and descriptions.
-   **`memory_categories`**: Association table for `Memory` and `Category`.
-   **`AccessControl`**: Defines access rules (subject, object, effect). *Further investigation might be needed to detail its exact usage patterns.*
-   **`ArchivePolicy`**: Defines rules for automatic memory archiving.
-   **`MemoryStatusHistory`**: Logs changes to a memory's state (who changed, old/new state, timestamp).
-   **`MemoryAccessLog`**: Logs access to memories by applications (memory ID, app ID, access type, timestamp).

## 5. API Endpoints (`routers/`)

### 5.1. Memory Endpoints (`memories.py`)

-   **`POST /api/v1/memories/`**: Create a new memory.
    -   Payload: `MemoryCreate` schema (defined in `schemas.py`, includes `content`, `user_id`, `app_id`, and optional `metadata_`).
-   **`POST /api/v1/memories/filter`**: List/search memories with filtering and pagination.
    -   Payload: Includes user_id, page, size, search_query, app_ids, category_ids, sort_column, sort_direction, show_archived.
    -   Response: `PaginatedMemoryResponse` (defined in `schemas.py`), which contains a list of `MemoryResponse` items and pagination details. `MemoryResponse` includes fields like `id`, `content`, `created_at` (as epoch timestamp), `state`, `app_id`, `app_name`, `categories` (list of strings), and `metadata_`.
-   **`GET /api/v1/memories/categories`**: Get available memory categories.
-   **`GET /api/v1/memories/{memory_id}`**: Get details of a specific memory.
    -   Response: `MemoryResponse` (defined in `schemas.py`).
-   **`PUT /api/v1/memories/{memory_id}`**: Update a memory.
    -   Payload: `MemoryUpdate` schema (defined in `schemas.py`, allows optional updates to `content`, `metadata_`, `state`).
-   **`DELETE /api/v1/memories/`**: Delete one or more memories.
    -   Payload: List of memory IDs.
-   **`POST /api/v1/memories/actions/archive`**: Archive specified memories. *(Endpoint name might be generic for state changes, needs confirmation)*
-   **`POST /api/v1/memories/actions/pause`**: Pause/unpause specified memories.
-   **`GET /api/v1/memories/{memory_id}/access-log`**: Get access log for a memory.
-   **`GET /api/v1/memories/{memory_id}/related`**: Get memories related to a specific memory.

### 5.2. Application Endpoints (`apps.py`)

-   **`GET /api/v1/apps/`**: List applications with filtering and pagination.
-   **`GET /api/v1/apps/{app_id}`**: Get details of a specific application.
-   **`PUT /api/v1/apps/{app_id}`**: Update application details (e.g., `is_active` status).
-   **`GET /api/v1/apps/{app_id}/memories`**: List memories created by a specific app.
-   **`GET /api/v1/apps/{app_id}/accessed`**: List memories accessed by a specific app.

### 5.3. Configuration Endpoints (`config.py`)

-   **`GET /api/v1/config/`**: Get the main application configuration.
-   **`PUT /api/v1/config/`**: Update the main application configuration.
-   **`POST /api/v1/config/reset`**: Reset configuration to default.
-   Endpoints for getting/updating specific configuration sections:
    -   `/llm`, `/embedder`, `/openmemory` (for `mem0` config).

### 5.4. Stats Endpoints (`stats.py`)

-   **`GET /api/v1/profile/`**: Get user profile statistics (total memories, total apps, etc.).

## 6. Key Functionalities & Logic

### 6.1. Memory Creation, Storage, and Data Handling
-   Memories are primarily managed through the `Memory` SQLAlchemy model (see Section 4 for model details).
-   **Data Handling via Schemas (`schemas.py`)**:
    -   `MemoryBase`: Base Pydantic model with `content` and `metadata_`.
    -   `MemoryCreate`: Used for request validation when creating memories, inheriting from `MemoryBase` and adding `user_id` and `app_id`.
    -   `MemoryUpdate`: Used for request validation when updating memories, allowing optional fields.
    -   `MemoryResponse`: Defines the structure of a single memory object returned by API endpoints. It adapts data from the `Memory` model for client consumption (e.g., converting `created_at` to epoch, including `app_name`).
    -   `PaginatedMemoryResponse`: Standard wrapper for returning lists of memories with pagination info.
-   Content is stored as plain text in the `Memory.content` field.
-   A vector representation (embedding) is associated with the memory, likely stored or referenced in `Memory.vector`, and managed by the external memory client (`mem0`).
-   Arbitrary metadata can be stored in the `Memory.metadata_` JSON field.

### 6.2. Memory Categorization
-   Triggered automatically after a memory is inserted or updated (`after_memory_insert`, `after_memory_update` event listeners in `models.py`).
-   The `categorize_memory` function calls `utils.categorization.get_categories_for_memory`, which is expected to use an LLM to determine categories based on memory content.
-   Categories are stored in the `Category` table and linked via `memory_categories`.

### 6.3. Memory Search & Retrieval
-   The `/api/v1/memories/filter` endpoint handles complex querying.
-   The MCP server's `search_memory` tool directly uses the vector store (e.g., Qdrant) via the memory client for semantic search, filtering by `user_id` and accessible memory IDs.

### 6.4. Configuration Management
-   System configurations are stored as JSON in the `value` field of the `Config` database table (see Section 4), identified by a unique `key`.
-   The `api/app/routers/config.py` file defines Pydantic models that structure these configurations for validation and API interaction. These include:
    -   `LLMConfig`: Defines settings for an LLM (e.g., model name, API key, temperature).
    -   `LLMProvider`: Wraps `LLMConfig` and specifies the provider (e.g., "openai", "ollama").
    -   `EmbedderConfig`: Defines settings for an embedding model (e.g., model name, API key).
    -   `EmbedderProvider`: Wraps `EmbedderConfig` and specifies the provider.
    -   `OpenMemoryConfig`: Specific settings for OpenMemory features (e.g., related to `mem0` behavior if applicable).
    -   `Mem0Config`: Likely contains detailed configuration for the `mem0` client itself.
    -   `ConfigSchema`: A top-level schema that aggregates `LLMProvider`, `EmbedderProvider`, and `OpenMemoryConfig` into a single configuration object, typically stored under the "main" key in the `Config` table.
-   The API endpoints in `config_router.py` use these schemas to get, update, and reset configurations, ensuring that the JSON stored in the database adheres to a defined structure.

### 6.5. External Memory Client (`utils.memory.py`)
-   The API abstracts interactions with an underlying memory system (likely `mem0`).
-   Functions like `get_memory_client()` initialize and provide this client.
-   This client is responsible for tasks like generating embeddings, vector search, and potentially other memory operations not directly handled by the API's database logic.
-   Lazy initialization (`get_memory_client_safe` in `mcp_server.py`) ensures the API can run with limited functionality if the memory client's dependencies (e.g., Ollama) are down.

### 6.6. Access Control (`utils.permissions.py`)
-   The `check_memory_access_permissions` function is used, particularly in the MCP server, to filter memories based on access rights.
-   The `AccessControl` model suggests a more generic ACL system, though its full implementation details via API endpoints are not immediately obvious from the router analysis alone.

### 6.7. MCP Server (`mcp_server.py`)
-   Provides programmatic access to core memory functions for external tools/agents.
-   Connects via Server-Sent Events (SSE) at `/mcp/{client_name}/sse/{user_id}`.
-   **Tools Exposed**:
    -   `add_memories(text: str)`: Adds a memory.
    -   `search_memory(query: str)`: Searches memories.
    -   `list_memories()`: Lists all accessible memories for the user.
    -   `delete_all_memories()`: Deletes all accessible memories for the user.
-   Handles user context (`user_id`, `client_name`) from the SSE connection URL.
-   Interacts with the database and the external memory client.
-   Logs memory access and status changes.

## 7. Data Flow Examples

### 7.1. Adding a Memory (via MCP)
1.  MCP Client connects to SSE endpoint, providing `user_id` and `client_name`.
2.  Client calls `add_memories` tool with memory `text`.
3.  `mcp_server.py`:
    a.  Retrieves `user_id`, `client_name`.
    b.  Gets/creates `User` and `App` records in DB.
    c.  Checks if `App` is active.
    d.  Calls `memory_client.add(text, user_id, metadata)`.
    e.  The memory client processes the text (e.g., generates embedding, stores in vector DB) and returns results including a memory ID.
    f.  `mcp_server.py` updates its local `Memory` table with the content and ID, and logs in `MemoryStatusHistory`.
4.  Response sent back to MCP client.

### 7.2. Searching Memories (via API)
1.  UI/Client sends POST request to `/api/v1/memories/filter` with search criteria.
2.  `memories_router.py` handles the request.
3.  It likely queries the database (`Memory` table) for text matches or metadata filters. For semantic search capabilities, it would need to interact with the vector search functionality provided by the memory client (this interaction point from the main API router is less explicit than in the MCP search).
4.  Results are paginated and returned as `PaginatedMemoryResponse`.

## 8. Startup Process (`main.py`)
1.  FastAPI app initialized.
2.  CORS middleware added.
3.  Database tables created if they don't exist (`Base.metadata.create_all`).
4.  Default user (`USER_ID` from env or "default_user") and default app (`DEFAULT_APP_ID` "openmemory") are created if not present.
5.  MCP server is set up (`setup_mcp_server`), which includes its routers.
6.  API routers (`memories_router`, `apps_router`, etc.) are included.
7.  Pagination support is added.

## 9. Areas for Further Clarification
-   Detailed interaction flow between API routers (e.g., `memories.py`) and the external memory client (`utils.memory.py`) for operations like semantic search or vector generation when not going through MCP.
-   Full usage patterns of the `AccessControl` model and how policies are managed via API.
-   Specifics of the `ArchivePolicy` implementation and how it's triggered.
-   The exact nature and capabilities of the external "memory client" (`mem0`).

This document provides a foundational understanding of the OpenMemory API architecture.
