import asyncio
import hashlib
import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from fastapi.responses import StreamingResponse

from app.ai_models import (
    AI_READ_TASKS,
    AI_WRITE_TASKS,
    AiCancelResponse,
    AiHistoryItem,
    AiInvokeInput,
    AiInvokeResponse,
    AiProposalReviewInput,
    AiProposalReviewResponse,
    AiTaskMetadata,
    AiTaskResult,
)
from app.ai_provider import estimate_tokens, stream_ai_response
from app.db import execute, fetch_all, fetch_one
from app.redis_client import get_redis
from app.services import DocumentsService, ROLE_HIERARCHY


TASK_TTL_SECONDS = 3600
EVENT_BUFFER_LIMIT = 512
STREAM_BLOCK_MS = 1000
TERMINAL_EVENT_TYPES = {"complete", "failed", "cancelled"}
_LOCAL_TASKS: dict[str, asyncio.Task] = {}


def task_status_key(task_id: str) -> str:
    return f"ai:task:{task_id}"


def task_meta_key(task_id: str) -> str:
    return f"ai:task-meta:{task_id}"


def task_cancel_key(task_id: str) -> str:
    return f"ai:task-cancel:{task_id}"


def task_stream_key(task_id: str) -> str:
    return f"ai:events:{task_id}:stream"


async def store_task_status(task: AiTaskResult) -> None:
    await get_redis().set(task_status_key(task.taskId), task.model_dump_json(), ex=TASK_TTL_SECONDS)


async def get_task_status(task_id: str) -> AiTaskResult | None:
    raw = await get_redis().get(task_status_key(task_id))
    return AiTaskResult.model_validate_json(raw) if raw else None


async def store_task_meta(meta: AiTaskMetadata) -> None:
    await get_redis().set(task_meta_key(meta.taskId), meta.model_dump_json(), ex=TASK_TTL_SECONDS)


async def get_task_meta(task_id: str) -> AiTaskMetadata | None:
    raw = await get_redis().get(task_meta_key(task_id))
    return AiTaskMetadata.model_validate_json(raw) if raw else None


async def request_cancel(task_id: str) -> None:
    await get_redis().set(task_cancel_key(task_id), "1", ex=TASK_TTL_SECONDS)


async def is_cancel_requested(task_id: str) -> bool:
    return await get_redis().get(task_cancel_key(task_id)) == "1"


async def clear_cancel_request(task_id: str) -> None:
    await get_redis().delete(task_cancel_key(task_id))


async def publish_event(event: dict) -> None:
    payload = json.dumps(event)
    redis = get_redis()
    await redis.xadd(
        task_stream_key(event["taskId"]),
        {"event": payload},
        maxlen=EVENT_BUFFER_LIMIT,
        approximate=True,
    )
    await redis.expire(task_stream_key(event["taskId"]), TASK_TTL_SECONDS)


async def iter_event_stream(task_id: str) -> AsyncIterator[bytes]:
    redis = get_redis()
    last_id = "0-0"

    buffered = await redis.xrange(task_stream_key(task_id), min="-", max="+")
    for entry_id, data in buffered:
        payload = json.loads(data["event"])
        last_id = entry_id
        yield format_sse(payload)
        if payload["type"] in TERMINAL_EVENT_TYPES:
            return

    while True:
        events = await redis.xread(
            {task_stream_key(task_id): last_id},
            count=EVENT_BUFFER_LIMIT,
            block=STREAM_BLOCK_MS,
        )
        if not events:
            continue

        for _stream, entries in events:
            for entry_id, data in entries:
                payload = json.loads(data["event"])
                last_id = entry_id
                yield format_sse(payload)
                if payload["type"] in TERMINAL_EVENT_TYPES:
                    return


def format_sse(event: dict) -> bytes:
    return f"event: {event['type']}\ndata: {json.dumps(event)}\n\n".encode("utf-8")


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def detect_stale(
    source_text_hash: str | None,
    source_state_vector: str | None,
    current_selection: str | None,
    current_state_vector: str | None,
) -> bool:
    selection_changed = (
        current_selection is not None
        and source_text_hash is not None
        and sha256(current_selection) != source_text_hash
    )
    state_vector_changed = (
        current_state_vector is not None
        and source_state_vector is not None
        and current_state_vector != source_state_vector
    )
    return selection_changed or state_vector_changed


class AiService:
    def __init__(self, documents_service: DocumentsService | None = None) -> None:
        self.documents_service = documents_service or DocumentsService()

    async def invoke(self, doc_id: str, body: AiInvokeInput, user_id: str) -> dict:
        document = await self.documents_service.find_document(doc_id)
        if not document["ai_enabled"]:
            raise HTTPException(status_code=403, detail="AI features are disabled for this document")

        role = await self.documents_service.get_user_role(doc_id, user_id)
        if not role:
            raise HTTPException(status_code=403, detail="No access to this document")

        if body.task in AI_WRITE_TASKS and ROLE_HIERARCHY[role] < ROLE_HIERARCHY["editor"]:
            raise HTTPException(status_code=403, detail="Editor access required for write AI tasks")
        if body.task in AI_READ_TASKS and ROLE_HIERARCHY[role] < ROLE_HIERARCHY["commenter"]:
            raise HTTPException(status_code=403, detail="Commenter access required for read AI tasks")

        task_id = str(uuid4())
        queued = AiTaskResult(taskId=task_id, status="queued")
        await store_task_status(queued)
        await store_task_meta(
            AiTaskMetadata(
                taskId=task_id,
                documentId=doc_id,
                userId=user_id,
                taskType=body.task,
            )
        )
        await publish_event({"type": "queued", "taskId": task_id})

        _LOCAL_TASKS[task_id] = asyncio.create_task(
            self._process_task(task_id, doc_id, user_id, body)
        )
        return AiInvokeResponse(taskId=task_id, status="queued").model_dump()

    async def stream_task(self, doc_id: str, task_id: str, user_id: str) -> StreamingResponse:
        await self._authorize_task(doc_id, task_id, user_id)
        return StreamingResponse(iter_event_stream(task_id), media_type="text/event-stream")

    async def get_status(self, doc_id: str, task_id: str, user_id: str) -> dict:
        await self._authorize_task(doc_id, task_id, user_id)
        status_obj = await get_task_status(task_id)
        if not status_obj:
            raise HTTPException(status_code=404, detail="Task not found or expired")
        return status_obj.model_dump()

    async def cancel(self, doc_id: str, task_id: str, user_id: str) -> dict:
        await self._authorize_task(doc_id, task_id, user_id)
        task = await get_task_status(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found or expired")
        if task.status in {"completed", "failed", "expired"}:
            raise HTTPException(status_code=409, detail=f"Cannot cancel a task in {task.status} state")
        if task.status == "cancelled":
            return AiCancelResponse(taskId=task_id, status="cancelled").model_dump()

        await request_cancel(task_id)
        local_task = _LOCAL_TASKS.get(task_id)
        if local_task and not local_task.done() and task.status == "queued":
            local_task.cancel()
            cancelled = AiTaskResult(taskId=task_id, status="cancelled", error="Cancelled before generation started")
            await store_task_status(cancelled)
            await publish_event({"type": "cancelled", "taskId": task_id, "reason": "Cancelled before generation started"})
            await clear_cancel_request(task_id)
            return AiCancelResponse(taskId=task_id, status="cancelled").model_dump()

        return AiCancelResponse(taskId=task_id, status="cancelling").model_dump()

    async def review(self, doc_id: str, task_id: str, review: AiProposalReviewInput, user_id: str) -> dict:
        interaction = await fetch_one(
            """
            SELECT *
            FROM ai_interactions
            WHERE id = %s AND document_id = %s
            LIMIT 1
            """,
            (task_id, doc_id),
        )
        if not interaction:
            raise HTTPException(status_code=404, detail="Proposal not found")

        role = await self.documents_service.get_user_role(doc_id, user_id)
        if not role:
            raise HTTPException(status_code=403, detail="No access to this document")

        task_type = interaction["task_type"]
        if task_type in AI_WRITE_TASKS and ROLE_HIERARCHY[role] < ROLE_HIERARCHY["editor"]:
            raise HTTPException(status_code=403, detail="Editor access required to review write AI tasks")
        if task_type in AI_READ_TASKS and ROLE_HIERARCHY[role] < ROLE_HIERARCHY["commenter"]:
            raise HTTPException(status_code=403, detail="Commenter access required to review read AI tasks")

        if interaction["status"] in {"accepted", "rejected", "partial"}:
            raise HTTPException(status_code=409, detail="Proposal has already been reviewed")
        if review.action == "partial" and not (review.appliedText or "").strip():
            raise HTTPException(status_code=409, detail="Partial review requires the applied text payload")

        stale = detect_stale(
            interaction.get("source_text_hash"),
            interaction.get("source_state_vector"),
            review.currentSelection,
            review.currentStateVector,
        )
        if stale and review.action != "reject":
            await execute(
                """
                UPDATE ai_interactions
                SET status = 'expired',
                    stale_at_review = TRUE,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (interaction["id"],),
            )
            raise HTTPException(status_code=409, detail="Proposal is stale because the source text changed. Regenerate it.")

        next_status = {
            "reject": "rejected",
            "partial": "partial",
            "accept": "accepted",
        }[review.action]
        applied_text = None if review.action == "reject" else (review.appliedText or interaction.get("proposal_text"))

        await execute(
            """
            UPDATE ai_interactions
            SET status = %s,
                applied_text = %s,
                stale_at_review = %s,
                updated_at = NOW()
            WHERE id = %s
            """,
            (next_status, applied_text, stale, interaction["id"]),
        )
        return AiProposalReviewResponse(
            taskId=task_id,
            status=next_status,
            stale=stale,
            appliedText=applied_text,
        ).model_dump()

    async def history(self, doc_id: str, user_id: str) -> list[dict]:
        role = await self.documents_service.get_user_role(doc_id, user_id)
        if not role:
            raise HTTPException(status_code=403, detail="No access to this document")
        rows = await fetch_all(
            """
            SELECT *
            FROM ai_interactions
            WHERE document_id = %s
            ORDER BY created_at DESC
            LIMIT 50
            """,
            (doc_id,),
        )
        return [
            AiHistoryItem(
                id=row["id"],
                documentId=row["document_id"],
                userId=row["user_id"],
                taskType=row["task_type"],
                inputTokens=row["input_tokens"],
                outputTokens=row["output_tokens"],
                modelUsed=row["model_used"],
                costCents=row["cost_cents"],
                status=row["status"],
                sourceTextHash=row.get("source_text_hash"),
                sourceText=row.get("source_text"),
                proposalText=row.get("proposal_text"),
                sourceStateVector=row.get("source_state_vector"),
                appliedText=row.get("applied_text"),
                staleAtReview=row["stale_at_review"],
                createdAt=row["created_at"],
                updatedAt=row["updated_at"],
            ).model_dump()
            for row in rows
        ]

    async def _authorize_task(self, doc_id: str, task_id: str, user_id: str) -> None:
        role = await self.documents_service.get_user_role(doc_id, user_id)
        if not role:
            raise HTTPException(status_code=403, detail="No access to this document")
        meta = await get_task_meta(task_id)
        if not meta or meta.documentId != doc_id:
            raise HTTPException(status_code=404, detail="Task not found or expired")

    async def _process_task(self, task_id: str, doc_id: str, user_id: str, body: AiInvokeInput) -> None:
        try:
            processing = AiTaskResult(taskId=task_id, status="processing")
            await store_task_status(processing)

            model, input_tokens, chunks = await stream_ai_response(
                body.task,
                body.selection,
                body.selectionHtml,
                body.language,
            )
            await publish_event({"type": "started", "taskId": task_id, "modelUsed": model})

            result = ""
            output_tokens = 0
            async for chunk in chunks:
                if await is_cancel_requested(task_id):
                    await self._handle_cancelled(task_id, "Generation cancelled by user")
                    return
                result += chunk
                output_tokens = estimate_tokens(result)
                await publish_event({"type": "chunk", "taskId": task_id, "chunk": chunk})
                await store_task_status(
                    AiTaskResult(
                        taskId=task_id,
                        status="processing",
                        result=result,
                        modelUsed=model,
                    )
                )

            if await is_cancel_requested(task_id):
                await self._handle_cancelled(task_id, "Generation cancelled by user")
                return

            cost_cents = max(1, ((input_tokens + output_tokens) * 10 + 999_999) // 1_000_000)
            completed = AiTaskResult(
                taskId=task_id,
                status="completed",
                result=result,
                inputTokens=input_tokens,
                outputTokens=output_tokens,
                modelUsed=model,
            )
            await store_task_status(completed)
            await publish_event(
                {
                    "type": "complete",
                    "taskId": task_id,
                    "result": result,
                    "inputTokens": input_tokens,
                    "outputTokens": output_tokens,
                    "modelUsed": model,
                }
            )
            await clear_cancel_request(task_id)
            await execute(
                """
                INSERT INTO ai_interactions (
                    id, document_id, user_id, task_type, input_tokens, output_tokens,
                    model_used, cost_cents, status, source_text_hash, source_text,
                    proposal_text, source_state_vector, applied_text, stale_at_review
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s, %s, %s, NULL, FALSE)
                """,
                (
                    task_id,
                    doc_id,
                    user_id,
                    body.task,
                    input_tokens,
                    output_tokens,
                    model,
                    cost_cents,
                    sha256(body.selection),
                    body.selection,
                    result,
                    body.stateVector,
                ),
            )
        except asyncio.CancelledError:
            await self._handle_cancelled(task_id, "Cancelled before generation started")
        except Exception as exc:
            message = str(exc) or "Unknown error"
            await store_task_status(AiTaskResult(taskId=task_id, status="failed", error=message))
            await publish_event({"type": "failed", "taskId": task_id, "error": message})
            await clear_cancel_request(task_id)
            await execute(
                """
                INSERT INTO ai_interactions (
                    id, document_id, user_id, task_type, input_tokens, output_tokens,
                    model_used, cost_cents, status, source_text_hash, source_text,
                    proposal_text, source_state_vector, applied_text, stale_at_review
                )
                VALUES (%s, %s, %s, %s, 0, 0, 'unknown', 0, 'failed', %s, %s, NULL, NULL, NULL, FALSE)
                ON CONFLICT (id) DO NOTHING
                """,
                (
                    task_id,
                    doc_id,
                    user_id,
                    body.task,
                    sha256(body.selection),
                    body.selection,
                ),
            )
        finally:
            _LOCAL_TASKS.pop(task_id, None)

    async def _handle_cancelled(self, task_id: str, reason: str) -> None:
        cancelled = AiTaskResult(taskId=task_id, status="cancelled", error=reason)
        await store_task_status(cancelled)
        await publish_event({"type": "cancelled", "taskId": task_id, "reason": reason})
        await clear_cancel_request(task_id)
