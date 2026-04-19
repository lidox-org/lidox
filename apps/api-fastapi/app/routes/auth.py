from fastapi import APIRouter, Request, Response

from app.dependencies import CurrentUser
from app.http import (
    AuthResponse,
    UserOut,
    clear_auth_cookies,
    set_access_cookie,
    set_refresh_cookie,
)
from app.models import ChangePasswordInput, LoginInput, RegisterInput, UpdateProfileInput
from app.security import AuthContext, decode_access_token, extract_access_token
from app.services import AuthService, duration_to_seconds, ensure_token_not_denied


router = APIRouter(prefix="/auth", tags=["auth"])
service = AuthService()


@router.post("/register", response_model=AuthResponse, summary="Register a user")
async def register(body: RegisterInput, response: Response) -> dict:
    result = await service.register(body.email, body.password, body.name)
    max_age_ms = duration_to_seconds(service.settings.jwt_expiration) * 1000
    secure = service.settings.environment == "production"
    set_access_cookie(response, result["accessToken"], max_age_ms, secure=secure)
    set_refresh_cookie(
        response,
        result["refreshToken"],
        service.settings.refresh_token_expiration_days,
        secure=secure,
    )
    return {"user": result["user"]}


@router.post("/login", response_model=AuthResponse, summary="Login with email/password")
async def login(body: LoginInput, response: Response) -> dict:
    result = await service.login(body.email, body.password)
    max_age_ms = duration_to_seconds(service.settings.jwt_expiration) * 1000
    secure = service.settings.environment == "production"
    set_access_cookie(response, result["accessToken"], max_age_ms, secure=secure)
    set_refresh_cookie(
        response,
        result["refreshToken"],
        service.settings.refresh_token_expiration_days,
        secure=secure,
    )
    return {"user": result["user"]}


@router.post("/refresh", response_model=AuthResponse, summary="Refresh session cookies")
async def refresh(request: Request, response: Response) -> dict:
    raw_token = request.cookies.get("refresh_token")
    if not raw_token:
        body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
        raw_token = body.get("refreshToken")
    if not raw_token:
        from app.http import api_error
        raise api_error(401, "No refresh token provided")

    result = await service.refresh(raw_token)
    max_age_ms = duration_to_seconds(service.settings.jwt_expiration) * 1000
    secure = service.settings.environment == "production"
    set_access_cookie(response, result["accessToken"], max_age_ms, secure=secure)
    set_refresh_cookie(
        response,
        result["refreshToken"],
        service.settings.refresh_token_expiration_days,
        secure=secure,
    )
    return {"user": result["user"]}


@router.get("/me", response_model=UserOut, summary="Current user")
async def me(current_user: AuthContext = CurrentUser):
    await ensure_token_not_denied(current_user)
    return await service.get_me(current_user.user_id)


@router.patch("/me", response_model=UserOut, summary="Update profile")
async def update_me(body: UpdateProfileInput, current_user: AuthContext = CurrentUser):
    await ensure_token_not_denied(current_user)
    return await service.update_me(current_user.user_id, body.name)


@router.post("/change-password", summary="Change password")
async def change_password(body: ChangePasswordInput, current_user: AuthContext = CurrentUser) -> dict:
    await ensure_token_not_denied(current_user)
    await service.change_password(
        current_user.user_id,
        body.currentPassword,
        body.newPassword,
    )
    return {"message": "Password changed"}


@router.post("/logout", summary="Clear session cookies")
async def logout(request: Request, response: Response) -> dict:
    token = extract_access_token(request)
    if token:
        try:
            auth = decode_access_token(token)
            if auth.jti:
                await service.deny_jti(auth.jti)
        except Exception:
            pass
    clear_auth_cookies(response, secure=service.settings.environment == "production")
    return {"message": "Logged out"}
