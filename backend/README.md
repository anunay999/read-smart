# Smart Read Mode API

A FastAPI-based backend service that helps users track and summarize their reading history using AI-powered memory and language models.

## Features

- Content chunking with multiple strategies (Langchain Recursive, Markdown Headers)
- Memory storage and retrieval using Mem0 and Qdrant
- Text rephrasing and summarization using Google's Gemini model
- SQLite database for storing page and chunk information
- Asynchronous API endpoints for better performance

## Prerequisites

- Python 3.13 or higher
- SQLite 3
- Qdrant vector database
- Google Cloud account with Gemini API access
- Mem0 API access

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd backend
```

2. Create and activate a virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -e .
```

4. Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

5. Edit `.env` and add your API keys and configuration:
```
# Application Settings
APP_NAME=Smart Read Mode API
APP_VERSION=0.1.0
DEBUG_MODE=false

# Database Settings
DATABASE_URL=sqlite:///./smart_read_mode.db

# Mem0 / Qdrant Settings
MEM0_API_KEY=your_mem0_api_key_here
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION_NAME=smart_read_memories
SIMILARITY_THRESHOLD=0.90

# Gemini LLM Settings
GEMINI_API_KEY=your_gemini_api_key_here
```

6. Start the Qdrant server (if running locally):
```bash
docker run -p 6333:6333 qdrant/qdrant
```

7. Run the FastAPI server:
```bash
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`. You can access the API documentation at `http://localhost:8000/docs`.

## API Endpoints

- `POST /api/v1/pages/process`: Process a new page and store its content
- `GET /api/v1/pages/{page_id}`: Get information about a processed page
- `GET /api/v1/pages/{page_id}/chunks`: Get chunks for a specific page
- `GET /api/v1/history`: Get reading history
- `GET /api/v1/config`: Get current configuration
- `PUT /api/v1/config`: Update configuration

## Development

### Running Tests

```bash
pytest
```

### Code Style

The project uses Black for code formatting and isort for import sorting. To format your code:

```bash
black .
isort .
```

## License

[Your License Here]

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
