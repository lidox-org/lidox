from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.http import APIModel


AI_WRITE_TASKS = {"rewrite", "summarize", "translate", "grammar", "restructure"}
AI_READ_TASKS = {"analyze", "explain"}
AI_TASKS = AI_WRITE_TASKS | AI_READ_TASKS


class AiInvokeInput(APIModel):
    task: str
    selection: str = Field(min_length=1, max_length=50000)
    selectionHtml: str | None = Field(default=None, min_length=1, max_length=100000)
    nodeId: str | None = None
    stateVector: str | None = None
    language: str | None = None

    @field_validator("task")
    @classmethod
    def validate_task(cls, value: str) -> str:
        if value not in AI_TASKS:
            raise ValueError("Invalid AI task")
        return value


class AiInvokeResponse(APIModel):
    taskId: str
    status: Literal["queued"]


class AiCancelResponse(APIModel):
    taskId: str
    status: Literal["cancelling", "cancelled"]


class AiTaskResult(APIModel):
    taskId: str
    status: Literal["queued", "processing", "completed", "failed", "cancelled", "expired"]
    result: str | None = None
    error: str | None = None
    inputTokens: int | None = None
    outputTokens: int | None = None
    modelUsed: str | None = None


class AiTaskMetadata(APIModel):
    taskId: str
    documentId: str
    userId: str
    taskType: str


class AiTaskEventBase(APIModel):
    taskId: str


class AiQueuedEvent(AiTaskEventBase):
    type: Literal["queued"]


class AiStartedEvent(AiTaskEventBase):
    type: Literal["started"]
    modelUsed: str | None = None


class AiChunkEvent(AiTaskEventBase):
    type: Literal["chunk"]
    chunk: str


class AiCompleteEvent(AiTaskEventBase):
    type: Literal["complete"]
    result: str
    inputTokens: int | None = None
    outputTokens: int | None = None
    modelUsed: str | None = None


class AiFailedEvent(AiTaskEventBase):
    type: Literal["failed"]
    error: str


class AiCancelledEvent(AiTaskEventBase):
    type: Literal["cancelled"]
    reason: str | None = None


class AiProposalReviewInput(APIModel):
    action: Literal["accept", "reject", "partial"]
    appliedText: str | None = None
    currentSelection: str | None = None
    currentStateVector: str | None = None


class AiProposalReviewResponse(APIModel):
    taskId: str
    status: Literal["pending", "accepted", "rejected", "partial", "failed", "cancelled", "expired"]
    stale: bool
    appliedText: str | None = None


class AiHistoryItem(APIModel):
    id: str
    documentId: str
    userId: str
    taskType: str
    inputTokens: int
    outputTokens: int
    modelUsed: str
    costCents: int
    status: str
    sourceTextHash: str | None = None
    sourceText: str | None = None
    proposalText: str | None = None
    sourceStateVector: str | None = None
    appliedText: str | None = None
    staleAtReview: bool
    createdAt: datetime
    updatedAt: datetime

