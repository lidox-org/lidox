from typing import Any

from redis.asyncio import Redis

from app.config import get_settings


_redis_client: Redis | None = None


def get_redis() -> Redis:
    global _redis_client
    if _redis_client is None:
        settings = get_settings()
        _redis_client = Redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _redis_client


async def ping_redis() -> bool:
    try:
        return bool(await get_redis().ping())
    except Exception:
        return False


async def close_redis() -> None:
    global _redis_client
    if _redis_client is not None:
        client = _redis_client
        _redis_client = None
        await client.aclose()

