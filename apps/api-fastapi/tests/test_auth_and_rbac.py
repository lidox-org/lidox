"""
Tests for auth cookie behavior and document RBAC enforcement.
All DB/Redis calls are patched so no live infrastructure is needed.
"""
from datetime import datetime, timezone
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
    assert "revoked" in response.json()["message"].lower()


def test_refresh_rejects_missing_token():
    with _no_redis():
        response = client.post("/api/auth/refresh")
    assert response.status_code == 401


def test_google_start_redirects_back_to_login_when_not_configured(monkeypatch):
    monkeypatch.setattr("app.routes.auth.AuthService.google_oauth_enabled", lambda self: False)

    response = client.get("/api/auth/google/start", follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"].endswith("/login?oauth_error=google_not_configured")


def test_google_callback_sets_session_cookies_and_redirects(monkeypatch):
    monkeypatch.setattr("app.routes.auth.AuthService.google_oauth_enabled", lambda self: True)
    monkeypatch.setattr(
        "app.routes.auth.AuthService.verify_google_oauth_state",
        lambda self, state_token, nonce: None,
    )

    async def fake_google_login(self, code):
        assert code == "google-code"
        return {
            "user": {"id": OWNER_ID, "email": "owner@test.com", "name": "Owner", "avatarUrl": None},
            "accessToken": "access-tok",
            "refreshToken": "refresh-tok",
        }

    monkeypatch.setattr("app.routes.auth.AuthService.login_with_google_code", fake_google_login)

    response = client.get(
        "/api/auth/google/callback?state=signed-state&code=google-code",
        cookies={"google_oauth_nonce": "nonce-123"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"].endswith("/dashboard")
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies


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


def test_editor_restore_returns_snapshot_payload(monkeypatch):
    async def fake_restore(self, doc_id, version_id, user_id):
        assert doc_id == DOC_ID
        assert version_id == VERSION_ID
        assert user_id == EDITOR_ID
        return {
            "message": "Version restored and broadcast to connected clients",
            "versionId": version_id,
            "restoredAt": datetime.now(timezone.utc),
            "restoredSnapshot": "c25hcHNob3Q=",
        }

    monkeypatch.setattr("app.routes.documents.DocumentsService.restore_version", fake_restore)
    with _no_redis():
        response = client.post(
            f"/api/documents/{DOC_ID}/versions/{VERSION_ID}/restore",
            cookies={"access_token": _token(EDITOR_ID)},
        )

    assert response.status_code == 200
    assert response.json()["versionId"] == VERSION_ID
    assert response.json()["restoredSnapshot"] == "c25hcHNob3Q="


def test_export_pdf_returns_downloadable_binary(monkeypatch):
    async def fake_export(self, doc_id, user_id, title, text):
        assert doc_id == DOC_ID
        assert user_id == VIEWER_ID
        assert title == "Roadmap"
        assert text == "Hello export"
        return ("roadmap.pdf", b"%PDF-1.4\nHello export")

    monkeypatch.setattr("app.routes.documents.DocumentsService.export_pdf", fake_export)
    with _no_redis():
        response = client.post(
            f"/api/documents/{DOC_ID}/export/pdf",
            json={"title": "Roadmap", "text": "Hello export"},
            cookies={"access_token": _token(VIEWER_ID)},
        )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-disposition"] == 'attachment; filename="roadmap.pdf"'
    assert response.content.startswith(b"%PDF-1.4")
