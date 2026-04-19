"""
Tests for auth cookie behavior and document RBAC enforcement.
All DB/Redis calls are patched so no live infrastructure is needed.
"""
import time
from unittest.mock import AsyncMock, MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import app

client = TestClient(app)
settings = get_settings()

DOC_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
VERSION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
OWNER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
EDITOR_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
VIEWER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
COMMENTER_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff"


def _token(user_id: str, jti: str = "test-jti") -> str:
    return jwt.encode(
        {"sub": user_id, "email": f"{user_id[:4]}@test.com", "jti": jti, "exp": int(time.time()) + 900},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def _no_redis():
    """Patch Redis so the JTI denial check always returns 'not denied'."""
    mock = AsyncMock()
    mock.sismember = AsyncMock(return_value=0)
    return patch("app.dependencies.get_redis", return_value=mock)


# ---------------------------------------------------------------------------
# Auth: cookies are httpOnly and tokens do not appear in JSON body
# ---------------------------------------------------------------------------

def test_login_returns_user_without_tokens_in_body(monkeypatch):
    async def fake_login(self, email, password):
        return {
            "user": {"id": OWNER_ID, "email": email, "name": "Owner", "avatarUrl": None},
            "accessToken": "access-tok",
            "refreshToken": "refresh-tok",
        }

    monkeypatch.setattr("app.routes.auth.AuthService.login", fake_login)
    with _no_redis():
        response = client.post("/api/auth/login", json={"email": "a@b.com", "password": "pass"})

    assert response.status_code == 200
    body = response.json()
    assert "accessToken" not in body
    assert "refreshToken" not in body
    assert body["user"]["id"] == OWNER_ID

    cookies = response.cookies
    assert "access_token" in cookies
    assert "refresh_token" in cookies


def test_logout_clears_cookies(monkeypatch):
    with _no_redis():
        async def fake_deny(self, jti, ttl=None):
            pass
        monkeypatch.setattr("app.routes.auth.AuthService.deny_jti", fake_deny)
        response = client.post(
            "/api/auth/logout",
            cookies={"access_token": _token(OWNER_ID)},
        )

    assert response.status_code == 200
    assert response.json() == {"message": "Logged out"}
    # Both cookies should be cleared (Set-Cookie with max-age=0 or expires in the past)
    set_cookie_headers = response.headers.get_list("set-cookie") if hasattr(response.headers, "get_list") else [
        v for k, v in response.headers.items() if k.lower() == "set-cookie"
    ]
    cookie_names = " ".join(set_cookie_headers)
    assert "access_token" in cookie_names
    assert "refresh_token" in cookie_names


def test_revoked_token_rejected_on_protected_route():
    token = _token(OWNER_ID, jti="revoked-jti")
    mock_redis = AsyncMock()
    mock_redis.sismember = AsyncMock(return_value=1)
    with patch("app.dependencies.get_redis", return_value=mock_redis):
        response = client.get("/api/auth-check", cookies={"access_token": token})
    assert response.status_code == 401
    assert "revoked" in response.json()["detail"].lower()


def test_refresh_rejects_missing_token():
    with _no_redis():
        response = client.post("/api/auth/refresh")
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# RBAC: document update — title requires editor, aiEnabled requires owner
# ---------------------------------------------------------------------------

def _mock_get_role(role: str | None):
    async def _get_role(self, doc_id, user_id):
        return role
    return _get_role


def _mock_find_doc():
    async def _find(self, doc_id):
        return {
            "id": doc_id,
            "title": "Test Doc",
            "ownerId": OWNER_ID,
            "aiEnabled": True,
            "createdAt": None,
            "updatedAt": None,
            "deletedAt": None,
        }
    return _find


def test_viewer_cannot_update_title(monkeypatch):
    monkeypatch.setattr("app.services.DocumentsService.get_user_role", _mock_get_role("viewer"))
    monkeypatch.setattr("app.services.DocumentsService.find_document", _mock_find_doc())
    with _no_redis():
        response = client.patch(
            f"/api/documents/{DOC_ID}",
            json={"title": "New Title"},
            cookies={"access_token": _token(VIEWER_ID)},
        )
    assert response.status_code == 403


def test_commenter_cannot_update_title(monkeypatch):
    monkeypatch.setattr("app.services.DocumentsService.get_user_role", _mock_get_role("commenter"))
    monkeypatch.setattr("app.services.DocumentsService.find_document", _mock_find_doc())
    with _no_redis():
        response = client.patch(
            f"/api/documents/{DOC_ID}",
            json={"title": "New Title"},
            cookies={"access_token": _token(COMMENTER_ID)},
        )
    assert response.status_code == 403


def test_editor_cannot_toggle_ai_enabled(monkeypatch):
    monkeypatch.setattr("app.services.DocumentsService.get_user_role", _mock_get_role("editor"))
    monkeypatch.setattr("app.services.DocumentsService.find_document", _mock_find_doc())
    with _no_redis():
        response = client.patch(
            f"/api/documents/{DOC_ID}",
            json={"aiEnabled": False},
            cookies={"access_token": _token(EDITOR_ID)},
        )
    assert response.status_code == 403


def test_only_owner_can_delete(monkeypatch):
    monkeypatch.setattr("app.services.DocumentsService.get_user_role", _mock_get_role("editor"))
    monkeypatch.setattr("app.services.DocumentsService.find_document", _mock_find_doc())
    with _no_redis():
        response = client.delete(
            f"/api/documents/{DOC_ID}",
            cookies={"access_token": _token(EDITOR_ID)},
        )
    assert response.status_code == 403


def test_stranger_cannot_access_document(monkeypatch):
    monkeypatch.setattr("app.services.DocumentsService.get_user_role", _mock_get_role(None))
    monkeypatch.setattr("app.services.DocumentsService.find_document", _mock_find_doc())
    with _no_redis():
        response = client.get(
            f"/api/documents/{DOC_ID}",
            cookies={"access_token": _token(VIEWER_ID)},
        )
    assert response.status_code == 403


def test_viewer_cannot_restore_version(monkeypatch):
    monkeypatch.setattr("app.services.DocumentsService.get_user_role", _mock_get_role("viewer"))
    monkeypatch.setattr("app.services.DocumentsService.find_document", _mock_find_doc())
    with _no_redis():
        response = client.post(
            f"/api/documents/{DOC_ID}/versions/{VERSION_ID}/restore",
            cookies={"access_token": _token(VIEWER_ID)},
        )
    assert response.status_code == 403
