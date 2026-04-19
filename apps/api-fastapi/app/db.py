from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import psycopg

from app.config import get_settings


@asynccontextmanager
async def get_db_connection() -> AsyncIterator[psycopg.AsyncConnection]:
    settings = get_settings()
    conn = await psycopg.AsyncConnection.connect(settings.database_url)
    try:
        yield conn
    finally:
        await conn.close()


async def ping_database() -> bool:
    try:
        async with get_db_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute("SELECT 1")
                await cur.fetchone()
        return True
    except Exception:
        return False

