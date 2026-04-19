from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


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

