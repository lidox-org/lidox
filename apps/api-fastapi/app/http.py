from datetime import datetime
from typing import Any

from fastapi import HTTPException, Response
from pydantic import BaseModel, ConfigDict, EmailStr


class APIModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, from_attributes=True)


class UserOut(APIModel):
    id: str
    email: EmailStr
    name: str
    avatarUrl: str | None = None


class AuthResponse(APIModel):
    user: UserOut


class DocumentOut(APIModel):
    id: str
    title: str
    ownerId: str
    aiEnabled: bool
    createdAt: datetime
    updatedAt: datetime
    deletedAt: datetime | None = None


class DocumentWithRoleOut(DocumentOut):
    role: str


class VersionOut(APIModel):
    id: str
    documentId: str
    snapshotUrl: str | None = None
    crdtClock: int
    createdBy: str
    createdAt: datetime


class PermissionUserOut(APIModel):
    id: str
    name: str
    email: EmailStr
    avatarUrl: str | None = None


class PermissionOut(APIModel):
    id: str
    documentId: str
    userId: str | None = None
    linkToken: str | None = None
    role: str
    createdAt: datetime
    user: PermissionUserOut | None = None


class RestoreResponse(APIModel):
    message: str
    versionId: str
    restoredAt: datetime
    restoredSnapshot: str | None = None


def api_error(status_code: int, message: Any) -> HTTPException:
    return HTTPException(status_code=status_code, detail=message)


def set_access_cookie(
    response: Response,
    token: str,
    max_age_ms: int,
    *,
    secure: bool,
) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=secure,
        samesite="strict",
        path="/",
        max_age=max_age_ms // 1000,
    )


def set_refresh_cookie(
    response: Response,
    token: str,
    max_age_days: int,
    *,
    secure: bool,
) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=secure,
        samesite="strict",
        path="/api/auth/refresh",
        max_age=max_age_days * 24 * 60 * 60,
    )


def clear_auth_cookies(response: Response, *, secure: bool) -> None:
    response.delete_cookie(
        "access_token",
        path="/",
        httponly=True,
        samesite="strict",
        secure=secure,
    )
    response.delete_cookie(
        "refresh_token",
        path="/api/auth/refresh",
        httponly=True,
        samesite="strict",
        secure=secure,
    )
