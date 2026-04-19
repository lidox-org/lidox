from fastapi import APIRouter

from app.ai_models import (
    AiCancelResponse,
    AiHistoryItem,
    AiInvokeInput,
    AiInvokeResponse,
    AiProposalReviewInput,
    AiProposalReviewResponse,
    AiTaskResult,
)
from app.ai_runtime import AiService
from app.dependencies import CurrentUser
from app.security import AuthContext, parse_uuid
from app.services import ensure_token_not_denied


router = APIRouter(prefix="/documents/{doc_id}/ai", tags=["ai"])
service = AiService()


@router.post("/invoke", response_model=AiInvokeResponse, summary="Invoke an AI task")
async def invoke_ai(doc_id: str, body: AiInvokeInput, current_user: AuthContext = CurrentUser):
    await ensure_token_not_denied(current_user)
    return await service.invoke(parse_uuid(doc_id, "document ID"), body, current_user.user_id)


@router.get("/history", response_model=list[AiHistoryItem], summary="List AI history")
async def ai_history(doc_id: str, current_user: AuthContext = CurrentUser):
    await ensure_token_not_denied(current_user)
    return await service.history(parse_uuid(doc_id, "document ID"), current_user.user_id)


@router.get("/tasks/{task_id}", response_model=AiTaskResult, summary="Get AI task status")
async def ai_status(doc_id: str, task_id: str, current_user: AuthContext = CurrentUser):
    await ensure_token_not_denied(current_user)
    return await service.get_status(
        parse_uuid(doc_id, "document ID"),
        parse_uuid(task_id, "task ID"),
        current_user.user_id,
    )


@router.get("/tasks/{task_id}/stream", summary="Stream AI task events")
async def ai_stream(doc_id: str, task_id: str, current_user: AuthContext = CurrentUser):
    await ensure_token_not_denied(current_user)
    return await service.stream_task(
        parse_uuid(doc_id, "document ID"),
        parse_uuid(task_id, "task ID"),
        current_user.user_id,
    )


@router.post("/tasks/{task_id}/cancel", response_model=AiCancelResponse, summary="Cancel AI task")
async def ai_cancel(doc_id: str, task_id: str, current_user: AuthContext = CurrentUser):
    await ensure_token_not_denied(current_user)
    return await service.cancel(
        parse_uuid(doc_id, "document ID"),
        parse_uuid(task_id, "task ID"),
        current_user.user_id,
    )


@router.post("/tasks/{task_id}/review", response_model=AiProposalReviewResponse, summary="Review AI proposal")
async def ai_review(
    doc_id: str,
    task_id: str,
    body: AiProposalReviewInput,
    current_user: AuthContext = CurrentUser,
):
    await ensure_token_not_denied(current_user)
    return await service.review(
        parse_uuid(doc_id, "document ID"),
        parse_uuid(task_id, "task ID"),
        body,
        current_user.user_id,
    )
