from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select, insert, update
from sqlalchemy.ext.asyncio import AsyncSession # For async DB operations if we switch engine
from typing import List

from .. import schemas
from ..database import engine, Configurations # Using SQLAlchemy Core
# from ..database import get_async_db # If using async session

router = APIRouter()

# Note: For MVP with SQLAlchemy Core and synchronous engine, direct execution is used.
# If switching to async engine and AsyncSession, dependency injection for session would be typical.

@router.get("/", response_model=List[schemas.ConfigItem])
async def get_all_configurations():
    """
    Retrieve all current system configurations.
    """
    query = select(Configurations.c.key, Configurations.c.value, Configurations.c.updated_at)
    try:
        with engine.connect() as connection:
            result = connection.execute(query)
            configs = [
                schemas.ConfigItem(key=row.key, value=row.value, updated_at=row.updated_at) 
                for row in result.fetchall()
            ]
        return configs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving configurations: {str(e)}")

@router.put("/", response_model=List[schemas.ConfigItem])
async def update_configurations(
    request: schemas.ConfigUpdateRequest,
):
    """
    Update or add new configuration items.
    Returns the updated list of all configurations.
    """
    updated_configs_data = []
    try:
        with engine.connect() as connection:
            for config_item in request.configs:
                # Check if key exists
                select_query = select(Configurations.c.key).where(Configurations.c.key == config_item.key)
                existing = connection.execute(select_query).fetchone()

                if existing:
                    stmt = (
                        update(Configurations)
                        .where(Configurations.c.key == config_item.key)
                        .values(value=config_item.value) # updated_at will auto-update
                    )
                else:
                    stmt = (
                        insert(Configurations)
                        .values(key=config_item.key, value=config_item.value)
                    )
                connection.execute(stmt)
            
            # Commit changes if using a transaction block, direct execute often auto-commits for simple statements
            # For explicit transaction: with connection.begin(): ... connection.commit()
            if hasattr(connection, 'commit'): # Check if commit is available (it is for Connection)
                 connection.commit()


            # Fetch all configs to return the updated list
            all_configs_query = select(Configurations.c.key, Configurations.c.value, Configurations.c.updated_at)
            result = connection.execute(all_configs_query)
            updated_configs_data = [
                schemas.ConfigItem(key=row.key, value=row.value, updated_at=row.updated_at)
                for row in result.fetchall()
            ]
        return updated_configs_data
    except Exception as e:
        # Rollback if an error occurs and a transaction was started
        # if hasattr(connection, 'rollback'): connection.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating configurations: {str(e)}")

# Example: Get a specific configuration key (optional)
@router.get("/{config_key}", response_model=schemas.ConfigItem)
async def get_specific_configuration(config_key: str):
    query = select(Configurations.c.key, Configurations.c.value, Configurations.c.updated_at).where(Configurations.c.key == config_key)
    try:
        with engine.connect() as connection:
            result = connection.execute(query).fetchone()
            if result:
                return schemas.ConfigItem(key=result.key, value=result.value, updated_at=result.updated_at)
            raise HTTPException(status_code=404, detail=f"Configuration key '{config_key}' not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving configuration '{config_key}': {str(e)}")
