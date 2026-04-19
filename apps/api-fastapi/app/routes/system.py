from fastapi import APIRouter

from app.config import get_settings
from app.dependencies import CurrentUser
from app.redis_client import ping_redis
from app.db import ping_database
from app.security import AuthContext
from app.services import ensure_token_not_denied


router = APIRouter(tags=["system"])


@router.get("/healthz", summary="Health check")
async def healthz() -> dict[str, object]:
    settings = get_settings()
    db_ok, redis_ok = await ping_database(), await ping_redis()
    return {
        "status": "ok" if db_ok and redis_ok else "degraded",
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "database": "ok" if db_ok else "unavailable",
        "redis": "ok" if redis_ok else "unavailable",
    }


@router.get(
    "/auth-check",
    summary="Validate access cookie or bearer token",
    description="Temporary migration route used to verify JWT/cookie auth wiring before the full endpoint port.",
)
async def auth_check(current_user: AuthContext = CurrentUser) -> dict[str, object]:
    await ensure_token_not_denied(current_user)
    return {
        "authenticated": True,
        "user": {
            "id": current_user.user_id,
            "email": current_user.email,
            "jti": current_user.jti,
        },
    }
