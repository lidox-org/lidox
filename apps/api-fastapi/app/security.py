from dataclasses import dataclass
from uuid import UUID

import jwt
from fastapi import HTTPException, Request, status

from app.config import get_settings


@dataclass(slots=True)
class AuthContext:
    user_id: str
    email: str
    jti: str | None = None


def extract_access_token(request: Request) -> str | None:
    settings = get_settings()

    cookie_token = request.cookies.get(settings.access_cookie_name)
    if cookie_token:
        return cookie_token

    auth_header = request.headers.get("Authorization", "")
    prefix = "Bearer "
    if auth_header.startswith(prefix):
        return auth_header[len(prefix) :].strip()

    return None


def decode_access_token(token: str) -> AuthContext:
    settings = get_settings()

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
        ) from exc

    subject = payload.get("sub")
    email = payload.get("email")

    if not subject or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token is missing required claims",
        )

    return AuthContext(
        user_id=str(subject),
        email=str(email),
        jti=str(payload["jti"]) if payload.get("jti") else None,
    )


def parse_uuid(value: str, label: str) -> str:
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {label}",
        ) from exc
