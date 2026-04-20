import asyncio
from contextlib import asynccontextmanager
from types import SimpleNamespace
from uuid import uuid4, UUID

from fastapi.testclient import TestClient

from app.dependencies import require_auth
from app import db as db_module
from app.services import AuthService
from app.main import app
from app.security import AuthContext


client = TestClient(app)

DOC_ID = "33333333-3333-3333-3333-333333333333"
TASK_ID = "44444444-4444-4444-4444-444444444444"
USER_ID = "11111111-1111-1111-1111-111111111111"


def override_auth() -> AuthContext:
    return AuthContext(user_id=USER_ID, email="user@example.com", jti="test-jti")


def test_healthz_exists() -> None:
    response = client.get("/api/healthz")

    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "Lidox API (FastAPI)"
    assert payload["status"] in {"ok", "degraded"}


def test_fetch_one_commits_returning_writes(monkeypatch) -> None:
    class FakeCursor:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def execute(self, query: str, params: tuple) -> None:
            self.query = query
            self.params = params

        async def fetchone(self) -> dict:
            return {"id": UUID("11111111-1111-4111-8111-111111111111")}

    class FakeConnection:
        def __init__(self) -> None:
            self.cursor_instance = FakeCursor()
            self.commit_calls = 0

        async def commit(self) -> None:
            self.commit_calls += 1

        def cursor(self) -> FakeCursor:
            return self.cursor_instance

    fake_conn = FakeConnection()

    @asynccontextmanager
    async def fake_get_db_connection():
        yield fake_conn

    monkeypatch.setattr(db_module, "get_db_connection", fake_get_db_connection)

    row = asyncio.run(
        db_module.fetch_one(
            "INSERT INTO example(id) VALUES (%s) RETURNING id",
            ("row-1",),
        )
    )

    assert row == {"id": "11111111-1111-4111-8111-111111111111"}
    assert fake_conn.commit_calls == 1


def test_fetch_all_normalizes_uuid_values(monkeypatch) -> None:
    class FakeCursor:
        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def execute(self, query: str, params: tuple) -> None:
            self.query = query
            self.params = params

        async def fetchall(self) -> list[dict]:
            return [
                {
                    "id": UUID("22222222-2222-4222-8222-222222222222"),
                    "owner_id": UUID("33333333-3333-4333-8333-333333333333"),
                }
            ]

    class FakeConnection:
        def __init__(self) -> None:
            self.cursor_instance = FakeCursor()
            self.commit_calls = 0

        async def commit(self) -> None:
            self.commit_calls += 1

        def cursor(self) -> FakeCursor:
            return self.cursor_instance

    fake_conn = FakeConnection()

    @asynccontextmanager
    async def fake_get_db_connection():
        yield fake_conn

    monkeypatch.setattr(db_module, "get_db_connection", fake_get_db_connection)

    rows = asyncio.run(db_module.fetch_all("SELECT * FROM example", ()))

    assert rows == [
        {
            "id": "22222222-2222-4222-8222-222222222222",
            "owner_id": "33333333-3333-4333-8333-333333333333",
        }
    ]
    assert fake_conn.commit_calls == 1


def test_issue_tokens_serializes_uuid_claims(monkeypatch) -> None:
    recorded: dict[str, object] = {}

    async def fake_execute(query: str, params: tuple) -> None:
        recorded["query"] = query
        recorded["params"] = params

    monkeypatch.setattr("app.services.execute", fake_execute)

    tokens = asyncio.run(
        AuthService().issue_tokens(uuid4(), "user@example.com", uuid4())
    )

    assert isinstance(tokens["accessToken"], str)
    assert isinstance(tokens["refreshToken"], str)
    assert isinstance(recorded["params"][0], str)
    assert isinstance(recorded["params"][2], str)


def test_auth_check_requires_authentication() -> None:
    response = client.get("/api/auth-check")

    assert response.status_code == 401
    assert response.json()["message"] == "Authentication required"


def test_ai_invoke_route_uses_service(monkeypatch) -> None:
    from app.routes import ai as ai_routes

    app.dependency_overrides[require_auth] = override_auth

    async def fake_invoke(doc_id: str, body, user_id: str) -> dict:
        assert doc_id == DOC_ID
        assert body.task == "rewrite"
        assert body.selection == "Hello world"
        assert user_id == USER_ID
        return {"taskId": TASK_ID, "status": "queued"}

    monkeypatch.setattr(ai_routes, "service", SimpleNamespace(invoke=fake_invoke))

    response = client.post(
        f"/api/documents/{DOC_ID}/ai/invoke",
        json={"task": "rewrite", "selection": "Hello world"},
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"taskId": TASK_ID, "status": "queued"}


def test_ai_cancel_route_uses_service(monkeypatch) -> None:
    from app.routes import ai as ai_routes

    app.dependency_overrides[require_auth] = override_auth

    async def fake_cancel(doc_id: str, task_id: str, user_id: str) -> dict:
        assert doc_id == DOC_ID
        assert task_id == TASK_ID
        assert user_id == USER_ID
        return {"taskId": task_id, "status": "cancelling"}

    monkeypatch.setattr(ai_routes, "service", SimpleNamespace(cancel=fake_cancel))

    response = client.post(f"/api/documents/{DOC_ID}/ai/tasks/{TASK_ID}/cancel")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"taskId": TASK_ID, "status": "cancelling"}


def test_ai_history_route_uses_service(monkeypatch) -> None:
    from app.routes import ai as ai_routes

    app.dependency_overrides[require_auth] = override_auth

    async def fake_history(doc_id: str, user_id: str) -> list[dict]:
        assert doc_id == DOC_ID
        assert user_id == USER_ID
        return [
            {
                "id": TASK_ID,
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

    response = client.get(f"/api/documents/{DOC_ID}/ai/history")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()[0]["taskType"] == "rewrite"


def test_ai_review_route_uses_service(monkeypatch) -> None:
    from app.routes import ai as ai_routes

    app.dependency_overrides[require_auth] = override_auth

    async def fake_review(doc_id: str, task_id: str, body, user_id: str) -> dict:
        assert doc_id == DOC_ID
        assert task_id == TASK_ID
        assert body.action == "accept"
        assert user_id == USER_ID
        return {"taskId": task_id, "status": "accepted", "stale": False, "appliedText": "Hello there"}

    monkeypatch.setattr(ai_routes, "service", SimpleNamespace(review=fake_review))

    response = client.post(
        f"/api/documents/{DOC_ID}/ai/tasks/{TASK_ID}/review",
        json={"action": "accept"},
    )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["status"] == "accepted"


def test_ai_status_route_uses_service(monkeypatch) -> None:
    from app.routes import ai as ai_routes

    app.dependency_overrides[require_auth] = override_auth

    async def fake_status(doc_id: str, task_id: str, user_id: str) -> dict:
        assert doc_id == DOC_ID
        assert task_id == TASK_ID
        assert user_id == USER_ID
        return {
            "taskId": task_id,
            "status": "completed",
            "result": "Hello there",
            "inputTokens": 10,
            "outputTokens": 12,
            "modelUsed": "mock",
        }

    monkeypatch.setattr(ai_routes, "service", SimpleNamespace(get_status=fake_status))

    response = client.get(f"/api/documents/{DOC_ID}/ai/tasks/{TASK_ID}")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["status"] == "completed"


def test_ai_stream_route_uses_service(monkeypatch) -> None:
    from fastapi.responses import StreamingResponse
    from app.routes import ai as ai_routes

    app.dependency_overrides[require_auth] = override_auth

    async def fake_stream(doc_id: str, task_id: str, user_id: str) -> StreamingResponse:
        assert doc_id == DOC_ID
        assert task_id == TASK_ID
        assert user_id == USER_ID

        async def event_iter():
            yield b'event: queued\ndata: {"type":"queued","taskId":"' + TASK_ID.encode() + b'"}\n\n'

        return StreamingResponse(event_iter(), media_type="text/event-stream")

    monkeypatch.setattr(ai_routes, "service", SimpleNamespace(stream_task=fake_stream))

    response = client.get(f"/api/documents/{DOC_ID}/ai/tasks/{TASK_ID}/stream")

    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")


def test_ai_proposal_lifecycle(monkeypatch) -> None:
    """
    End-to-end proposal lifecycle: invoke -> status shows proposal -> accept -> status shows accepted.
    All service calls are faked; this verifies the state transitions flow through the routes correctly.
    """
    from app.routes import ai as ai_routes

    app.dependency_overrides[require_auth] = override_auth

    state: dict = {"status": "queued", "appliedText": None}

    async def fake_invoke(doc_id: str, body, user_id: str) -> dict:
        state["status"] = "processing"
        return {"taskId": TASK_ID, "status": "queued"}

    async def fake_status(doc_id: str, task_id: str, user_id: str) -> dict:
        return {
            "taskId": task_id,
            "status": state["status"],
            "result": "Rewritten text",
            "inputTokens": 5,
            "outputTokens": 8,
            "modelUsed": "mock",
        }

    async def fake_review(doc_id: str, task_id: str, body, user_id: str) -> dict:
        assert body.action == "accept"
        state["status"] = "completed"
        state["appliedText"] = "Rewritten text"
        return {
            "taskId": task_id,
            "status": "accepted",
            "stale": False,
            "appliedText": "Rewritten text",
        }

    fake_service = SimpleNamespace(
        invoke=fake_invoke,
        get_status=fake_status,
        review=fake_review,
    )
    monkeypatch.setattr(ai_routes, "service", fake_service)

    # Step 1: invoke
    r1 = client.post(
        f"/api/documents/{DOC_ID}/ai/invoke",
        json={"task": "rewrite", "selection": "Original text"},
    )
    assert r1.status_code == 200
    assert r1.json()["taskId"] == TASK_ID

    # Step 2: poll status — should reflect active processing state
    r2 = client.get(f"/api/documents/{DOC_ID}/ai/tasks/{TASK_ID}")
    assert r2.status_code == 200
    assert r2.json()["status"] == "processing"

    # Step 3: accept proposal
    r3 = client.post(
        f"/api/documents/{DOC_ID}/ai/tasks/{TASK_ID}/review",
        json={"action": "accept"},
    )
    assert r3.status_code == 200
    assert r3.json()["status"] == "accepted"
    assert r3.json()["appliedText"] == "Rewritten text"

    # Step 4: transport status remains a completed task after review
    r4 = client.get(f"/api/documents/{DOC_ID}/ai/tasks/{TASK_ID}")
    assert r4.status_code == 200
    assert r4.json()["status"] == "completed"

    app.dependency_overrides.clear()
