from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.dependencies import require_auth
from app.main import app
from app.security import AuthContext


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
    assert response.json()["message"] == "Authentication required"


def override_auth() -> AuthContext:
    return AuthContext(
        user_id="11111111-1111-1111-1111-111111111111",
        email="user@example.com",
        jti="22222222-2222-2222-2222-222222222222",
    )


def test_ai_invoke_route_uses_service(monkeypatch) -> None:
    from app.routes import ai as ai_routes

    app.dependency_overrides[require_auth] = override_auth

    async def fake_ensure_token_not_denied(_auth: AuthContext) -> None:
        return None

    async def fake_invoke(doc_id: str, body, user_id: str) -> dict:
        assert doc_id == "33333333-3333-3333-3333-333333333333"
        assert body.task == "rewrite"
        assert body.selection == "Hello world"
        assert user_id == "11111111-1111-1111-1111-111111111111"
        return {"taskId": "44444444-4444-4444-4444-444444444444", "status": "queued"}

    monkeypatch.setattr(ai_routes, "service", SimpleNamespace(invoke=fake_invoke))
    monkeypatch.setattr(ai_routes, "ensure_token_not_denied", fake_ensure_token_not_denied)

    response = client.post(
        "/api/documents/33333333-3333-3333-3333-333333333333/ai/invoke",
        json={"task": "rewrite", "selection": "Hello world"},
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "taskId": "44444444-4444-4444-4444-444444444444",
        "status": "queued",
    }


def test_ai_cancel_route_uses_service(monkeypatch) -> None:
    from app.routes import ai as ai_routes

    app.dependency_overrides[require_auth] = override_auth

    async def fake_ensure_token_not_denied(_auth: AuthContext) -> None:
        return None

    async def fake_cancel(doc_id: str, task_id: str, user_id: str) -> dict:
        assert doc_id == "33333333-3333-3333-3333-333333333333"
        assert task_id == "44444444-4444-4444-4444-444444444444"
        assert user_id == "11111111-1111-1111-1111-111111111111"
        return {"taskId": task_id, "status": "cancelling"}

    monkeypatch.setattr(ai_routes, "service", SimpleNamespace(cancel=fake_cancel))
    monkeypatch.setattr(ai_routes, "ensure_token_not_denied", fake_ensure_token_not_denied)

    response = client.post(
        "/api/documents/33333333-3333-3333-3333-333333333333/ai/tasks/44444444-4444-4444-4444-444444444444/cancel"
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {
        "taskId": "44444444-4444-4444-4444-444444444444",
        "status": "cancelling",
    }


def test_ai_history_route_uses_service(monkeypatch) -> None:
    from app.routes import ai as ai_routes

    app.dependency_overrides[require_auth] = override_auth

    async def fake_ensure_token_not_denied(_auth: AuthContext) -> None:
        return None

    async def fake_history(doc_id: str, user_id: str) -> list[dict]:
        assert doc_id == "33333333-3333-3333-3333-333333333333"
        assert user_id == "11111111-1111-1111-1111-111111111111"
        return [
            {
                "id": "44444444-4444-4444-4444-444444444444",
                "documentId": doc_id,
                "userId": user_id,
                "taskType": "rewrite",
                "inputTokens": 10,
                "outputTokens": 12,
                "modelUsed": "mock",
                "costCents": 0,
                "status": "pending",
                "sourceTextHash": None,
                "sourceText": "Hello",
                "proposalText": "Hello there",
                "sourceStateVector": None,
                "appliedText": None,
                "staleAtReview": False,
                "createdAt": "2026-04-20T00:00:00Z",
                "updatedAt": "2026-04-20T00:00:00Z",
            }
        ]

    monkeypatch.setattr(ai_routes, "service", SimpleNamespace(history=fake_history))
    monkeypatch.setattr(ai_routes, "ensure_token_not_denied", fake_ensure_token_not_denied)

    response = client.get(
        "/api/documents/33333333-3333-3333-3333-333333333333/ai/history"
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()[0]["taskType"] == "rewrite"


def test_ai_review_route_uses_service(monkeypatch) -> None:
    from app.routes import ai as ai_routes

    app.dependency_overrides[require_auth] = override_auth

    async def fake_ensure_token_not_denied(_auth: AuthContext) -> None:
        return None

    async def fake_review(doc_id: str, task_id: str, body, user_id: str) -> dict:
        assert doc_id == "33333333-3333-3333-3333-333333333333"
        assert task_id == "44444444-4444-4444-4444-444444444444"
        assert body.action == "accept"
        assert user_id == "11111111-1111-1111-1111-111111111111"
        return {
            "taskId": task_id,
            "status": "accepted",
            "stale": False,
            "appliedText": "Hello there",
        }

    monkeypatch.setattr(ai_routes, "service", SimpleNamespace(review=fake_review))
    monkeypatch.setattr(ai_routes, "ensure_token_not_denied", fake_ensure_token_not_denied)

    response = client.post(
        "/api/documents/33333333-3333-3333-3333-333333333333/ai/tasks/44444444-4444-4444-4444-444444444444/review",
        json={"action": "accept"},
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["status"] == "accepted"


def test_ai_status_route_uses_service(monkeypatch) -> None:
    from app.routes import ai as ai_routes

    app.dependency_overrides[require_auth] = override_auth

    async def fake_ensure_token_not_denied(_auth: AuthContext) -> None:
        return None

    async def fake_status(doc_id: str, task_id: str, user_id: str) -> dict:
        assert doc_id == "33333333-3333-3333-3333-333333333333"
        assert task_id == "44444444-4444-4444-4444-444444444444"
        assert user_id == "11111111-1111-1111-1111-111111111111"
        return {
            "taskId": task_id,
            "status": "completed",
            "result": "Hello there",
            "inputTokens": 10,
            "outputTokens": 12,
            "modelUsed": "mock",
        }

    monkeypatch.setattr(ai_routes, "service", SimpleNamespace(get_status=fake_status))
    monkeypatch.setattr(ai_routes, "ensure_token_not_denied", fake_ensure_token_not_denied)

    response = client.get(
        "/api/documents/33333333-3333-3333-3333-333333333333/ai/tasks/44444444-4444-4444-4444-444444444444"
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["status"] == "completed"


def test_ai_stream_route_uses_service(monkeypatch) -> None:
    from fastapi.responses import StreamingResponse
    from app.routes import ai as ai_routes

    app.dependency_overrides[require_auth] = override_auth

    async def fake_ensure_token_not_denied(_auth: AuthContext) -> None:
        return None

    async def fake_stream(doc_id: str, task_id: str, user_id: str) -> StreamingResponse:
        assert doc_id == "33333333-3333-3333-3333-333333333333"
        assert task_id == "44444444-4444-4444-4444-444444444444"
        assert user_id == "11111111-1111-1111-1111-111111111111"

        async def event_iter():
            yield b'event: queued\ndata: {"type":"queued","taskId":"44444444-4444-4444-4444-444444444444"}\n\n'

        return StreamingResponse(event_iter(), media_type="text/event-stream")

    monkeypatch.setattr(ai_routes, "service", SimpleNamespace(stream_task=fake_stream))
    monkeypatch.setattr(ai_routes, "ensure_token_not_denied", fake_ensure_token_not_denied)

    response = client.get(
        "/api/documents/33333333-3333-3333-3333-333333333333/ai/tasks/44444444-4444-4444-4444-444444444444/stream"
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
