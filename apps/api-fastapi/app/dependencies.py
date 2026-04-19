from fastapi import Depends, HTTPException, Request, status

from app.redis_client import get_redis
from app.security import AuthContext, decode_access_token, extract_access_token


async def require_auth(request: Request) -> AuthContext:
    token = extract_access_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    ctx = decode_access_token(token)
    if ctx.jti:
        redis = get_redis()
        if await redis.sismember("denied_jtis", ctx.jti):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked",
            )
    return ctx


CurrentUser = Depends(require_auth)
