from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

import psycopg
from psycopg.rows import dict_row

from app.config import get_settings


@asynccontextmanager
async def get_db_connection() -> AsyncIterator[psycopg.AsyncConnection]:
    settings = get_settings()
    conn = await psycopg.AsyncConnection.connect(
        settings.database_url,
        row_factory=dict_row,
    )
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


def normalize_db_value(value):
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {key: normalize_db_value(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [normalize_db_value(inner) for inner in value]
    if isinstance(value, tuple):
        return tuple(normalize_db_value(inner) for inner in value)
    return value


async def fetch_one(query: str, params: tuple | list = ()) -> dict | None:
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            row = await cur.fetchone()
        await conn.commit()
        return normalize_db_value(row) if row is not None else None


async def fetch_all(query: str, params: tuple | list = ()) -> list[dict]:
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
            rows = await cur.fetchall()
        await conn.commit()
        return normalize_db_value(list(rows))


async def execute(query: str, params: tuple | list = ()) -> None:
    async with get_db_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query, params)
        await conn.commit()


async def fetchval(query: str, params: tuple | list = ()) -> object | None:
    row = await fetch_one(query, params)
    if not row:
        return None
    return next(iter(row.values()))
