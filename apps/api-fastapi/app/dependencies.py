from fastapi import Depends, HTTPException, Request, status

from app.security import AuthContext, decode_access_token, extract_access_token


async def require_auth(request: Request) -> AuthContext:
    token = extract_access_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return decode_access_token(token)


CurrentUser = Depends(require_auth)

