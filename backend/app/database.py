import sqlalchemy
from sqlalchemy import create_engine, Table, Column, Integer, String, Text, Float, DateTime, ForeignKey, MetaData
from sqlalchemy.sql import func
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from contextlib import asynccontextmanager

from .config import settings

DATABASE_URL = settings.DATABASE_URL.replace('sqlite:///', 'sqlite+aiosqlite:///')

# Create async engine
engine = create_async_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

# Create async session factory
async_session = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

metadata = MetaData()

WebPages = Table(
    "web_pages",
    metadata,
    Column("id", Integer, primary_key=True, index=True, autoincrement=True),
    Column("url", String, unique=True, index=True, nullable=False),
    Column("title", String, nullable=True),
    Column("processed_at", DateTime(timezone=True), server_default=func.now()),
    Column("content_hash", String, nullable=True, index=True),
)

ContentChunks = Table(
    "content_chunks",
    metadata,
    Column("id", Integer, primary_key=True, index=True, autoincrement=True),
    Column("page_id", Integer, ForeignKey("web_pages.id"), nullable=False),
    Column("mem0_id", String, unique=True, index=True, nullable=False),
    Column("chunk_text_preview", Text, nullable=True),
    Column("order_in_page", Integer, nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
)

UserReadHistory = Table(
    "user_read_history",
    metadata,
    Column("id", Integer, primary_key=True, index=True, autoincrement=True),
    Column("mem0_chunk_id", String, index=True, nullable=False),
    Column("first_seen_on_page_id", Integer, ForeignKey("web_pages.id"), nullable=False),
    Column("first_seen_at", DateTime(timezone=True), server_default=func.now()),
    Column("last_seen_on_page_id", Integer, ForeignKey("web_pages.id"), nullable=False),
    Column("last_seen_at", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
    Column("seen_count", Integer, default=1, nullable=False),
)

Configurations = Table(
    "configurations",
    metadata,
    Column("key", String, primary_key=True, index=True),
    Column("value", Text, nullable=False),
    Column("updated_at", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()),
)

async def create_db_and_tables():
    try:
        async with engine.begin() as conn:
            await conn.run_sync(metadata.create_all)
        print("Database tables created successfully (if they didn't exist).")
    except Exception as e:
        print(f"Error creating database tables: {e}")

@asynccontextmanager
async def get_session() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

# To be called from main.py on startup
# if __name__ == "__main__":
#     create_db_and_tables()
