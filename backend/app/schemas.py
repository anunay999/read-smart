from pydantic import BaseModel, HttpUrl
from typing import List, Optional, Dict, Any
import datetime

# Schemas for Page Processing
class PageProcessRequest(BaseModel):
    url: HttpUrl
    text_content: str # Pre-processed text content of the page
    title: Optional[str] = None # Optional title from client

class ChunkOutput(BaseModel):
    original_text: str
    status: str # "new", "seen", "summarized"
    processed_text: Optional[str] = None # Summarized/rephrased text from Gemini
    source_page_url: Optional[HttpUrl] = None # URL of page where this chunk was previously seen
    order: int

class PageProcessResponse(BaseModel):
    page_url: HttpUrl
    page_title: Optional[str]
    chunks: List[ChunkOutput]
    # errors: Optional[List[str]] = None # For reporting issues during processing

# Schemas for Configuration Management
class ConfigItemBase(BaseModel):
    value: str

class ConfigItemCreate(ConfigItemBase):
    key: str

class ConfigItemUpdate(ConfigItemBase):
    pass

class ConfigItem(ConfigItemBase):
    key: str
    updated_at: datetime.datetime

    class Config:
        # Pydantic V2 allows orm_mode via model_config
        # For Pydantic V1, use: orm_mode = True
        # For Pydantic V2, if you were using SQLAlchemy ORM models:
        # from pydantic import ConfigDict
        # model_config = ConfigDict(from_attributes=True)
        # Since we are using SQLAlchemy Core and constructing dicts, this is not strictly needed yet
        # but good to keep in mind if we switch to ORM.
        pass

class ConfigUpdateRequest(BaseModel):
    configs: List[ConfigItemCreate] # List of key-value pairs to update/create

# Schemas for Database Models (for responses, if needed, or internal use)
# These are more detailed representations if you need to return full DB objects.
# For now, PageProcessResponse and ConfigItem are the primary API-facing schemas.

class WebPageSchema(BaseModel):
    id: int
    url: HttpUrl
    title: Optional[str] = None
    processed_at: datetime.datetime
    content_hash: Optional[str] = None

    class Config:
        # from_attributes = True # Pydantic V2
        pass


class ContentChunkSchema(BaseModel):
    id: int
    page_id: int
    mem0_id: str
    chunk_text_preview: Optional[str] = None
    order_in_page: int
    created_at: datetime.datetime

    class Config:
        # from_attributes = True # Pydantic V2
        pass

class UserReadHistorySchema(BaseModel):
    id: int
    mem0_chunk_id: str
    first_seen_on_page_id: int
    first_seen_at: datetime.datetime
    last_seen_on_page_id: int
    last_seen_at: datetime.datetime
    seen_count: int

    class Config:
        # from_attributes = True # Pydantic V2
        pass
