from typing import List, Dict, Any, Optional
from mem0 import Memory
from fastapi import HTTPException
import logging

from ..config import get_mem0_config

# Configure logging
logger = logging.getLogger(__name__)

# Initialize mem0 client
mem0_client = None

def initialize_mem0_client() -> None:
    """Initialize the Mem0 client with configuration."""
    global mem0_client
    try:
        config = get_mem0_config()
        mem0_client = Memory(config=config)
        logger.info("Mem0 client initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Mem0 client: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to initialize memory service"
        )

async def add_to_memory(text: str, metadata: Dict[str, Any]) -> Optional[str]:
    """
    Adds a text chunk to memory using mem0.
    Returns the mem0 ID of the added item, or None if failed.
    Metadata should include 'original_url', 'page_id', 'order_in_page'.
    """
    if not mem0_client:
        initialize_mem0_client()
    
    try:
        response = mem0_client.add(content=text, metadata=metadata)
        
        # Extract ID from response
        mem0_id = None
        if isinstance(response, str):
            mem0_id = response
        elif isinstance(response, dict) and "id" in response:
            mem0_id = response["id"]
        elif hasattr(response, 'id'):
            mem0_id = response.id
        
        if mem0_id:
            logger.info(f"Added to mem0: ID {mem0_id}, Text: '{text[:50]}...'")
            return str(mem0_id)
        else:
            logger.error(f"Failed to add to mem0 or extract ID. Text: '{text[:50]}...'. Response: {response}")
            return None

    except Exception as e:
        logger.error(f"Error adding to mem0: {e}. Text: '{text[:50]}...'")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to add content to memory: {str(e)}"
        )

async def search_memory(query_text: str, limit: int = 1) -> List[Dict[str, Any]]:
    """
    Searches memory for text similar to query_text using mem0.
    Returns a list of search results. Each result is a dict including
    'id', 'text', 'score', and 'metadata'.
    """
    if not mem0_client:
        initialize_mem0_client()

    try:
        search_results = mem0_client.search(query=query_text, limit=limit)
        
        processed_results = []
        if search_results:
            for res in search_results:
                item = {}
                if isinstance(res, dict):
                    item['id'] = str(res.get('id'))
                    item['text'] = res.get('text') or res.get('content')
                    item['score'] = res.get('score')
                    item['metadata'] = res.get('metadata', {})
                elif hasattr(res, 'id'):
                    item['id'] = str(res.id)
                    item['text'] = getattr(res, 'text', getattr(res, 'content', None))
                    item['score'] = getattr(res, 'score', None)
                    item['metadata'] = getattr(res, 'metadata', {})
                
                if item.get('id') and item.get('score') is not None:
                    processed_results.append(item)

        logger.info(f"Searched mem0 for: '{query_text[:50]}...'. Found {len(processed_results)} results.")
        return processed_results
        
    except Exception as e:
        logger.error(f"Error searching mem0: {e}. Query: '{query_text[:50]}...'")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to search memory: {str(e)}"
        )

async def delete_from_memory(mem0_id: str) -> bool:
    """
    Deletes a memory item by its mem0 ID.
    Returns True if successful, False otherwise.
    """
    if not mem0_client:
        initialize_mem0_client()

    try:
        result = mem0_client.delete(id=mem0_id)
        logger.info(f"Deleted from mem0: ID {mem0_id}")
        return bool(result)
    except Exception as e:
        logger.error(f"Error deleting from mem0: {e}. ID: {mem0_id}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete memory: {str(e)}"
        )

# Example usage (for testing this service directly)
# if __name__ == "__main__":
#     import asyncio
#     async def main_test():
#         # This test assumes mem0 client is configured and Qdrant is running.
#         if not mem0_client:
#             print("Cannot run test: mem0 client not initialized.")
#             return

#         test_metadata = {"original_url": "http://example.com/test", "page_id": 1, "order_in_page": 0}
#         added_id = await add_to_memory("This is a test memory chunk for Smart Read.", test_metadata)
        
#         if added_id:
#             print(f"Successfully added memory with ID: {added_id}")
#             results = await search_memory("test memory for reading")
#             for res in results:
#                 print(f"Found: ID {res['id']}, Score: {res['score']:.4f}, Text: '{res['text']}', Metadata: {res['metadata']}")
#         else:
#             print("Failed to add test memory.")

#     asyncio.run(main_test())
