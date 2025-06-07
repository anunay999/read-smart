from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import insert, select, update
from typing import List, Dict, Any
from pydantic import HttpUrl
import logging
import datetime

from .. import schemas
from ..services import content_processor, memory_service, llm_service
from ..database import WebPages, ContentChunks, UserReadHistory, get_session
from ..config import settings

# Configure logging
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/process", response_model=schemas.PageProcessResponse)
async def process_page(
    request: schemas.PageProcessRequest,
    session: AsyncSession = Depends(get_session)
):
    """
    Processes a webpage's text content:
    - Chunks the text
    - Compares chunks against user's memory via mem0
    - Identifies new vs. seen content
    - Stores new unique chunks in mem0
    - Optionally rephrases/summarizes seen content using Gemini
    - Returns a structured representation of the page
    """
    logger.info(f"Processing URL: {request.url}, Title: {request.title if request.title else 'N/A'}")
    logger.info(f"Received text content length: {len(request.text_content)}")

    page_id: int
    page_title_to_return = request.title

    try:
        # --- 1. Store/Update WebPage Metadata ---
        async with session.begin():
            # Check if page exists
            select_page_stmt = select(WebPages.c.id, WebPages.c.title).where(WebPages.c.url == str(request.url))
            result = await session.execute(select_page_stmt)
            existing_page = result.fetchone()

            if existing_page:
                page_id = existing_page.id
                if not page_title_to_return and existing_page.title:
                    page_title_to_return = existing_page.title
                # Update processed_at and title if new one is provided
                update_page_stmt = update(WebPages).where(WebPages.c.id == page_id).values(
                    processed_at=datetime.datetime.now(datetime.timezone.utc)
                )
                if request.title and request.title != existing_page.title:
                    update_page_stmt = update_page_stmt.values(title=request.title)
                await session.execute(update_page_stmt)
            else:
                insert_page_stmt = insert(WebPages).values(
                    url=str(request.url), 
                    title=request.title,
                    processed_at=datetime.datetime.now(datetime.timezone.utc)
                )
                result = await session.execute(insert_page_stmt)
                page_id = result.inserted_primary_key[0]

        # --- 2. Chunk the text content ---
        chunked_data_list = content_processor.chunk_text(request.text_content)

        if not chunked_data_list:
            return schemas.PageProcessResponse(
                page_url=request.url,
                page_title=page_title_to_return,
                chunks=[schemas.ChunkOutput(original_text="No processable content found.", status="new", order=0)]
            )

        final_chunk_outputs_map: Dict[int, schemas.ChunkOutput] = {}
        seen_chunks_for_gemini: List[Dict[str, Any]] = []

        # --- 3. Process each chunk ---
        for chunk_data in chunked_data_list:
            original_text = chunk_data["original_text"]
            order = chunk_data["order"]

            search_results = await memory_service.search_memory(query_text=original_text, limit=1)

            is_seen = False
            source_page_url_for_chunk = None
            seen_mem0_id = None

            if search_results:
                top_match = search_results[0]
                if top_match.get('score') is not None and isinstance(top_match['score'], (float, int)):
                    if top_match['score'] >= settings.SIMILARITY_THRESHOLD:
                        is_seen = True
                        seen_mem0_id = top_match['id']
                        if top_match.get('metadata') and 'original_url' in top_match['metadata']:
                            try:
                                source_page_url_for_chunk = HttpUrl(top_match['metadata']['original_url'])
                            except Exception:
                                source_page_url_for_chunk = None
                        logger.info(f"Chunk order {order} is SEEN. Mem0 ID: {seen_mem0_id}, Score: {top_match['score']:.4f}")

            async with session.begin():
                if is_seen and seen_mem0_id:
                    # Update UserReadHistory
                    update_history_stmt = (
                        update(UserReadHistory)
                        .where(UserReadHistory.c.mem0_chunk_id == seen_mem0_id)
                        .values(
                            last_seen_on_page_id=page_id,
                            last_seen_at=datetime.datetime.now(datetime.timezone.utc),
                            seen_count=UserReadHistory.c.seen_count + 1,
                        )
                    )
                    await session.execute(update_history_stmt)

                    # Prepare for Gemini
                    seen_chunks_for_gemini.append({
                        "original_text": original_text,
                        "order": order,
                        "source_page_url": str(source_page_url_for_chunk) if source_page_url_for_chunk else None
                    })

                    final_chunk_outputs_map[order] = schemas.ChunkOutput(
                        original_text=original_text,
                        status="seen",
                        processed_text=original_text,
                        source_page_url=source_page_url_for_chunk,
                        order=order
                    )
                else:
                    mem0_metadata = {
                        "original_url": str(request.url),
                        "page_id": page_id,
                        "order_in_page": order
                    }
                    new_mem0_id = await memory_service.add_to_memory(text=original_text, metadata=mem0_metadata)

                    if new_mem0_id:
                        insert_chunk_stmt = insert(ContentChunks).values(
                            page_id=page_id,
                            mem0_id=new_mem0_id,
                            chunk_text_preview=original_text[:100],
                            order_in_page=order
                        )
                        await session.execute(insert_chunk_stmt)

                        insert_history_stmt = insert(UserReadHistory).values(
                            mem0_chunk_id=new_mem0_id,
                            first_seen_on_page_id=page_id,
                            last_seen_on_page_id=page_id
                        )
                        await session.execute(insert_history_stmt)

                        final_chunk_outputs_map[order] = schemas.ChunkOutput(
                            original_text=original_text,
                            status="new",
                            source_page_url=None,
                            order=order
                        )
                    else:
                        logger.warning(f"Failed to add chunk order {order} to mem0")
                        final_chunk_outputs_map[order] = schemas.ChunkOutput(
                            original_text=original_text,
                            status="new",
                            source_page_url=None,
                            order=order
                        )

        # --- 4. Process seen chunks with Gemini ---
        if seen_chunks_for_gemini:
            logger.info(f"Sending {len(seen_chunks_for_gemini)} seen chunks to Gemini for rephrasing")
            rephrased_texts = await llm_service.rephrase_batch(seen_chunks_for_gemini)

            for i, rephrased_text_or_none in enumerate(rephrased_texts):
                chunk_order_for_llm = seen_chunks_for_gemini[i]["order"]
                if rephrased_text_or_none and chunk_order_for_llm in final_chunk_outputs_map:
                    final_chunk_outputs_map[chunk_order_for_llm].processed_text = rephrased_text_or_none
                    final_chunk_outputs_map[chunk_order_for_llm].status = "summarized"

        # --- 5. Construct final response ---
        sorted_final_chunk_outputs = sorted(final_chunk_outputs_map.values(), key=lambda c: c.order)

        if not sorted_final_chunk_outputs:
            sorted_final_chunk_outputs.append(
                schemas.ChunkOutput(
                    original_text="No processable content found or an error occurred during processing.",
                    status="new",
                    order=0,
                )
            )

        return schemas.PageProcessResponse(
            page_url=request.url,
            page_title=page_title_to_return,
            chunks=sorted_final_chunk_outputs,
        )

    except Exception as e:
        logger.error(f"Error processing page: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process page: {str(e)}"
        )

@router.get("/{page_id}", response_model=schemas.PageInfo)
async def get_page_info(
    page_id: int,
    session: AsyncSession = Depends(get_session)
):
    """Get information about a processed page."""
    try:
        async with session.begin():
            select_page_stmt = select(WebPages).where(WebPages.c.id == page_id)
            result = await session.execute(select_page_stmt)
            page = result.fetchone()

            if not page:
                raise HTTPException(status_code=404, detail="Page not found")

            return schemas.PageInfo(
                id=page.id,
                url=page.url,
                title=page.title,
                processed_at=page.processed_at
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting page info: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get page info: {str(e)}"
        )

@router.get("/{page_id}/chunks", response_model=List[schemas.ChunkInfo])
async def get_page_chunks(
    page_id: int,
    session: AsyncSession = Depends(get_session)
):
    """Get chunks for a specific page."""
    try:
        async with session.begin():
            select_chunks_stmt = (
                select(ContentChunks)
                .where(ContentChunks.c.page_id == page_id)
                .order_by(ContentChunks.c.order_in_page)
            )
            result = await session.execute(select_chunks_stmt)
            chunks = result.fetchall()

            if not chunks:
                return []

            return [
                schemas.ChunkInfo(
                    id=chunk.id,
                    mem0_id=chunk.mem0_id,
                    preview=chunk.chunk_text_preview,
                    order=chunk.order_in_page,
                    created_at=chunk.created_at
                )
                for chunk in chunks
            ]
    except Exception as e:
        logger.error(f"Error getting page chunks: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get page chunks: {str(e)}"
        )
