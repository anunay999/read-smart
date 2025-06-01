# Backend API Server Development Instructions

## Objective
Develop a Python-based backend API server using the Google Agent Development Kit (ADK). The server will provide functionalities for managing user memory and rephrasing page content. The entire application, including a dependent MCP memory server, should be containerized using Docker Compose.

## Core Requirements

### 1. API Endpoints (to be exposed via ADK Agents)
   - **Add Page to Memory:**
     - Input: User ID, Page ID, Page Content
     - Action: Store the page content in the user's memory. This should ideally create or update an entity representing the user and add observations related to the page content.
   - **Rephrase with Content & Memory:**
     - Input: User ID, Page Content
     - Action: Rephrase the given page content, taking into account the user's existing memory (retrieved from the MCP memory server). The rephrased content should focus on new information not present in memory and provide a recap of relevant items already in memory.
     - Output: Rephrased content in Markdown format.
   - **Rephrase with Instruction:**
     - Input: Page Content, Rephrasing Instruction
     - Action: Rephrase the page content based *only* on the provided instruction.
     - Output: Rephrased content in Markdown format.
   - **Rephrase Full (Content, Memory, & Instruction):**
     - Input: User ID, Page Content, Optional Rephrasing Instruction
     - Action: Rephrase the page content considering both the user's memory and the specific instruction (if provided).
     - Output: Rephrased content in Markdown format.

### 2. Memory Management
   - Utilize the MCP memory server: `https://github.com/modelcontextprotocol/servers/tree/main/src/memory`.
   - This server should be run as a separate service in the Docker Compose setup.
   - An ADK agent (`MemoryAgent`) should be created to interface with this MCP server's tools (e.g., for creating entities, adding observations, searching nodes). The `MemoryAgent` will use `MCPToolSet` for this interaction.

### 3. Rephrasing Logic
   - Use the Gemini LLM for all rephrasing tasks.
   - The API key for Gemini should be configurable via environment variables (e.g., `GOOGLE_API_KEY`).
   - An ADK agent (`RephrasingAgent`) should encapsulate the rephrasing logic and interaction with the Gemini API.

### 4. Technology Stack & Setup
   - **Programming Language:** Python (version 3.9+).
   - **API Framework:** Google Agent Development Kit (ADK) with its built-in API server.
   - **Package Manager:** `uv`.
   - **Containerization:** Docker Compose for all services (ADK API server, MCP memory server).
   - **Project Structure:** All backend code, Docker files, and configurations should reside within the `backend` subdirectory of the `read-smart` project.

### 5. Evaluation & Testing
   - Develop evaluation scripts (e.g., using Python with `httpx` or `requests`) to test all API functionalities. These scripts should be placed in a `backend/tests` directory.
   - Tests should verify:
     - Correct storage and retrieval of user memory via the `MemoryAgent`.
     - Accuracy of rephrased content, ensuring it respects user memory (focus on new information, recap old information).
     - Adherence to rephrasing instructions.
     - Output is in valid Markdown format.

## Deliverables
1.  A `backend` directory containing all source code for the ADK agents (`MemoryAgent`, `RephrasingAgent`, and any orchestrator/main agent registration in `main.py`), supporting files, and test scripts.
2.  A `docker-compose.yml` file in the `backend` directory to orchestrate the services.
3.  A `Dockerfile` in the `backend` directory (or a relevant subdirectory like `backend/app`) for the ADK API server application.
4.  A `pyproject.toml` in the `backend` directory for Python dependencies, managed by `uv`.
5.  Evaluation scripts in `backend/tests/`.
6.  An updated `backend/README.md` explaining how to build, run, and test the backend services.
