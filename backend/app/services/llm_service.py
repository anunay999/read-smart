import google as genai
from typing import List, Dict, Any, Optional
from fastapi import HTTPException
import logging

from ..config import get_gemini_config

# Configure logging
logger = logging.getLogger(__name__)

# Initialize Gemini model
_gemini_model = None

def initialize_gemini_model() -> None:
    """Initialize the Gemini model with configuration."""
    global _gemini_model
    try:
        config = get_gemini_config()
        genai.configure(api_key=config["api_key"])
        _gemini_model = genai.GenerativeModel(
            model_name=config["model"],
            generation_config={
                "temperature": config["temperature"],
                "max_output_tokens": config["max_output_tokens"],
            }
        )
        logger.info(f"Gemini model initialized: {config['model']}")
    except Exception as e:
        logger.error(f"Failed to initialize Gemini model: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to initialize LLM service"
        )

def get_gemini_model():
    """Get or initialize the Gemini model."""
    if _gemini_model is None:
        initialize_gemini_model()
    return _gemini_model

async def rephrase_batch(seen_chunks_data: List[Dict[str, Any]]) -> List[Optional[str]]:
    """
    Sends a batch of seen chunks to Gemini for rephrasing/summarization.
    
    Args:
        seen_chunks_data: A list of dictionaries, where each dict should have
                          at least 'original_text' and 'order'.
                          Example: [{"original_text": "...", "order": 0, "source_page_url": "..."}, ...]

    Returns:
        A list of rephrased texts (strings) or None for each chunk if processing failed.
        The order of this list matches the input order of seen_chunks_data.
    """
    model = get_gemini_model()
    if not model:
        raise HTTPException(
            status_code=500,
            detail="LLM service not available"
        )

    if not seen_chunks_data:
        return []

    # Construct prompt for batch processing
    prompt_parts = [
        "You are an expert at concisely rephrasing or summarizing previously seen text. "
        "Below are text segments. For each segment, provide a one or two-sentence rephrasing or summary. "
        "Maintain the original meaning but make it more concise as if reminding someone of content they've read. "
        "Format your response as a JSON array of strings, where each string is the rephrased version of the corresponding input segment. "
        "Do not include any additional text or explanation, just the JSON array."
        "\n---"
    ]

    # Create input texts
    input_texts_for_llm = []
    for i, chunk_data in enumerate(seen_chunks_data):
        input_texts_for_llm.append(f"Segment {i+1} Original Text:\n{chunk_data['original_text']}\n---")
    
    full_prompt = "\n".join(prompt_parts + input_texts_for_llm)
    
    rephrased_results = [None] * len(seen_chunks_data)

    try:
        response = await model.generate_content_async(full_prompt)
        raw_llm_output = response.text.strip()

        # Try to parse as JSON array
        try:
            import json
            summaries = json.loads(raw_llm_output)
            if isinstance(summaries, list) and len(summaries) == len(seen_chunks_data):
                rephrased_results = summaries
            else:
                logger.warning("LLM response was not a valid JSON array of expected length")
                # Fallback to line-by-line parsing
                lines = raw_llm_output.split('\n')
                for i in range(min(len(lines), len(rephrased_results))):
                    rephrased_results[i] = lines[i].strip()
        except json.JSONDecodeError:
            # If JSON parsing fails, try line-by-line parsing
            lines = raw_llm_output.split('\n')
            for i in range(min(len(lines), len(rephrased_results))):
                rephrased_results[i] = lines[i].strip()

        logger.info(f"Successfully rephrased {len(seen_chunks_data)} items")

    except Exception as e:
        logger.error(f"Error calling Gemini API: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to rephrase content: {str(e)}"
        )

    return rephrased_results

async def summarize_text(text: str, max_length: int = 200) -> str:
    """
    Summarizes a single text using Gemini.
    
    Args:
        text: The text to summarize
        max_length: Maximum length of the summary in characters

    Returns:
        A summarized version of the text
    """
    model = get_gemini_model()
    if not model:
        raise HTTPException(
            status_code=500,
            detail="LLM service not available"
        )

    try:
        prompt = f"Summarize the following text in {max_length} characters or less:\n\n{text}"
        response = await model.generate_content_async(prompt)
        summary = response.text.strip()
        logger.info(f"Successfully summarized text of length {len(text)}")
        return summary
    except Exception as e:
        logger.error(f"Error summarizing text: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to summarize text: {str(e)}"
        )

# Example usage (for testing this service directly)
# if __name__ == "__main__":
#     import asyncio
#     async def main_llm_test():
#         if not get_gemini_model():
#             print("Cannot run LLM test: Gemini model not initialized/configured.")
#             return

#         sample_seen_chunks = [
#             {"original_text": "The quick brown fox jumps over the lazy dog.", "order": 0},
#             {"original_text": "She sells seashells by the seashore.", "order": 1},
#             {"original_text": "Peter Piper picked a peck of pickled peppers.", "order": 2}
#         ]
#         print(f"\nTesting rephrase_batch with {len(sample_seen_chunks)} chunks...")
#         results = await rephrase_batch(sample_seen_chunks)
        
#         for i, chunk_data in enumerate(sample_seen_chunks):
#             print(f"\nOriginal (Order {chunk_data['order']}): {chunk_data['original_text']}")
#             print(f"Rephrased: {results[i]}")
            
#     asyncio.run(main_llm_test())
