from secrets import token_urlsafe

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse

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
from app.services import AuthService, duration_to_seconds


router = APIRouter(prefix="/auth", tags=["auth"])
service = AuthService()
GOOGLE_OAUTH_NONCE_COOKIE = "google_oauth_nonce"


def build_login_redirect(error_code: str) -> RedirectResponse:
    return RedirectResponse(
        f"{service.settings.web_base_url}/login?oauth_error={error_code}",
        status_code=302,
    )


def clear_google_oauth_nonce(response: Response) -> None:
    response.delete_cookie(
        GOOGLE_OAUTH_NONCE_COOKIE,
        path="/api/auth/google/callback",
        httponly=True,
        samesite="lax",
        secure=service.settings.environment == "production",
    )


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


@router.get("/google/start", include_in_schema=False)
async def google_start() -> RedirectResponse:
    if not service.google_oauth_enabled():
        return build_login_redirect("google_not_configured")

    nonce = token_urlsafe(24)
    state_token = service.create_google_oauth_state_token(nonce)
    response = RedirectResponse(service.build_google_auth_url(state_token), status_code=302)
    response.set_cookie(
        GOOGLE_OAUTH_NONCE_COOKIE,
        nonce,
        httponly=True,
        secure=service.settings.environment == "production",
        samesite="lax",
        path="/api/auth/google/callback",
        max_age=600,
    )
    return response


@router.get("/google/callback", include_in_schema=False)
async def google_callback(request: Request) -> RedirectResponse:
    if not service.google_oauth_enabled():
        return build_login_redirect("google_not_configured")

    oauth_error = request.query_params.get("error")
    if oauth_error:
        response = build_login_redirect(
            "google_access_denied" if oauth_error == "access_denied" else "google_auth_failed"
        )
        clear_google_oauth_nonce(response)
        return response

    nonce = request.cookies.get(GOOGLE_OAUTH_NONCE_COOKIE) or ""
    state_token = request.query_params.get("state") or ""
    code = request.query_params.get("code") or ""

    if not nonce or not state_token or not code:
        response = build_login_redirect("google_invalid_state")
        clear_google_oauth_nonce(response)
        return response

    try:
        service.verify_google_oauth_state(state_token, nonce)
    except HTTPException:
        response = build_login_redirect("google_invalid_state")
        clear_google_oauth_nonce(response)
        return response

    try:
        result = await service.login_with_google_code(code)
    except HTTPException:
        response = build_login_redirect("google_auth_failed")
        clear_google_oauth_nonce(response)
        return response

    response = RedirectResponse(f"{service.settings.web_base_url}/dashboard", status_code=302)
    max_age_ms = duration_to_seconds(service.settings.jwt_expiration) * 1000
    secure = service.settings.environment == "production"
    set_access_cookie(response, result["accessToken"], max_age_ms, secure=secure)
    set_refresh_cookie(
        response,
        result["refreshToken"],
        service.settings.refresh_token_expiration_days,
        secure=secure,
    )
    clear_google_oauth_nonce(response)
    return response


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
    return await service.get_me(current_user.user_id)


@router.patch("/me", response_model=UserOut, summary="Update profile")
async def update_me(body: UpdateProfileInput, current_user: AuthContext = CurrentUser):
    return await service.update_me(current_user.user_id, body.name)


@router.post("/change-password", summary="Change password")
async def change_password(body: ChangePasswordInput, current_user: AuthContext = CurrentUser) -> dict:
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
