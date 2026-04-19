import time
from unittest.mock import AsyncMock, patch

import jwt
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app


client = TestClient(app)
settings = get_settings()


def _make_token(jti: str = "test-jti", sub: str = "user-1", email: str = "a@b.com") -> str:
    return jwt.encode(
        {"sub": sub, "email": email, "jti": jti, "exp": int(time.time()) + 900},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def test_healthz_exists() -> None:
    response = client.get("/api/healthz")

    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "Lidox API (FastAPI)"
    assert payload["status"] in {"ok", "degraded"}


def test_auth_check_requires_authentication() -> None:
    response = client.get("/api/auth-check")

    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication required"


def test_auth_check_accepts_valid_cookie() -> None:
    token = _make_token()
    with patch("app.dependencies.get_redis") as mock_get_redis:
        mock_redis = AsyncMock()
        mock_redis.sismember = AsyncMock(return_value=0)
        mock_get_redis.return_value = mock_redis
        response = client.get(
            "/api/auth-check",
            cookies={"access_token": token},
        )
    assert response.status_code == 200


def test_auth_check_rejects_revoked_token() -> None:
    token = _make_token(jti="revoked-jti")
    with patch("app.dependencies.get_redis") as mock_get_redis:
        mock_redis = AsyncMock()
        mock_redis.sismember = AsyncMock(return_value=1)
        mock_get_redis.return_value = mock_redis
        response = client.get(
            "/api/auth-check",
            cookies={"access_token": token},
        )
    assert response.status_code == 401
    assert "revoked" in response.json()["detail"].lower()
