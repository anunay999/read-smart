from typing import List, Dict, Any, Optional
from langchain.text_splitter import RecursiveCharacterTextSplitter, MarkdownHeaderTextSplitter
from fastapi import HTTPException
import logging
import re

# Configure logging
logger = logging.getLogger(__name__)

# Using Langchain for more robust text splitting.
# The user will need to ensure 'langchain' is added to project dependencies (e.g., pyproject.toml).

def chunk_text_with_langchain(
    text_content: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 100,
    separators: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Chunks the given text content using Langchain's RecursiveCharacterTextSplitter.
    Each chunk includes its original text and order.
    """
    if not text_content or not text_content.strip():
        return []

    try:
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            is_separator_regex=False,
            separators=separators or ["\n\n", "\n", ". ", " ", ""]
        )

        split_texts = text_splitter.split_text(text_content)
        
        chunks = []
        for i, text_part in enumerate(split_texts):
            chunks.append({
                "original_text": text_part.strip(),
                "order": i
            })
                
        logger.info(f"Successfully chunked text into {len(chunks)} chunks")
        return chunks
    except Exception as e:
        logger.error(f"Error chunking text with Langchain: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to chunk text: {str(e)}"
        )

def chunk_markdown_with_headers(
    text_content: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 100
) -> List[Dict[str, Any]]:
    """
    Chunks markdown text while preserving header structure.
    """
    if not text_content or not text_content.strip():
        return []

    try:
        # Define headers to split on
        headers_to_split_on = [
            ("#", "Header 1"),
            ("##", "Header 2"),
            ("###", "Header 3"),
            ("####", "Header 4"),
        ]

        markdown_splitter = MarkdownHeaderTextSplitter(
            headers_to_split_on=headers_to_split_on
        )

        # First split by headers
        header_splits = markdown_splitter.split_text(text_content)

        # Then split each section into smaller chunks if needed
        chunks = []
        current_order = 0

        for split in header_splits:
            if len(split.page_content) <= chunk_size:
                chunks.append({
                    "original_text": split.page_content.strip(),
                    "order": current_order,
                    "metadata": split.metadata
                })
                current_order += 1
            else:
                # Further split long sections
                sub_chunks = chunk_text_with_langchain(
                    split.page_content,
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap
                )
                for sub_chunk in sub_chunks:
                    sub_chunk["metadata"] = split.metadata
                    sub_chunk["order"] = current_order
                    chunks.append(sub_chunk)
                    current_order += 1

        logger.info(f"Successfully chunked markdown into {len(chunks)} chunks")
        return chunks
    except Exception as e:
        logger.error(f"Error chunking markdown: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to chunk markdown: {str(e)}"
        )

def chunk_text(
    text_content: str, 
    strategy: str = "langchain_recursive",
    chunk_size: int = 1000,
    chunk_overlap: int = 100,
    separators: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Processes text content into chunks based on the specified strategy.
    
    Args:
        text_content: The text to chunk
        strategy: One of "langchain_recursive", "markdown_headers"
        chunk_size: Target size for each chunk in characters
        chunk_overlap: Overlap between chunks in characters
        separators: Custom separators for langchain_recursive strategy
    """
    if not text_content or not text_content.strip():
        return []

    try:
        if strategy == "langchain_recursive":
            return chunk_text_with_langchain(
                text_content, 
                chunk_size=chunk_size, 
                chunk_overlap=chunk_overlap,
                separators=separators
            )
        elif strategy == "markdown_headers":
            return chunk_markdown_with_headers(
                text_content,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap
            )
        else:
            raise ValueError(f"Unsupported chunking strategy: {strategy}. Supported: 'langchain_recursive', 'markdown_headers'.")
    except Exception as e:
        logger.error(f"Error in chunk_text: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process text: {str(e)}"
        )

if __name__ == '__main__':
    sample_text = """This is the first long paragraph. It contains multiple sentences and is intended to be split by the RecursiveCharacterTextSplitter. The splitter will try to find good places to break the text, such as double newlines, single newlines, spaces, and then by character if necessary.

    This is a second paragraph, also quite long. We want to see how Langchain handles these kinds of texts. The goal is to get meaningful chunks that are not too large for embedding models or LLM context windows, while maintaining coherence. Overlap can help preserve context between chunks.

    A third, shorter paragraph.

    And a fourth one. This one might be combined or split depending on its length relative to the chunk_size parameter.
    Let's add more text to make sure it gets processed properly. We are testing the chunking functionality.
    This is an important feature for the Smart Read Mode API.
    """
    
    print("--- Chunking with Langchain RecursiveCharacterTextSplitter ---")
    # Test with default chunk_size and chunk_overlap
    langchain_chunks = chunk_text(sample_text, strategy="langchain_recursive", chunk_size=200, chunk_overlap=20)
    for i, chunk_data in enumerate(langchain_chunks):
        print(f"Chunk {i} (Order: {chunk_data['order']}):")
        print(f"'{chunk_data['original_text']}'")
        print(f"Length: {len(chunk_data['original_text'])}")
        print("-" * 20)

    print(f"\nTotal chunks created: {len(langchain_chunks)}")
