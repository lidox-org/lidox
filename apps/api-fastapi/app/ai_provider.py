import asyncio
from collections.abc import AsyncIterator

import httpx

from app.ai_models import AI_TASKS
from app.config import get_settings


MODEL_FOR_TASK = {
    "grammar": "llama-3.1-8b-instant",
    "explain": "llama-3.1-8b-instant",
    "rewrite": "llama-3.3-70b-versatile",
    "summarize": "llama-3.3-70b-versatile",
    "translate": "llama-3.3-70b-versatile",
    "restructure": "llama-3.3-70b-versatile",
    "analyze": "llama-3.3-70b-versatile",
}


def build_prompt(task: str, selection: str, selection_html: str | None, language: str | None) -> tuple[str, str]:
    html_rules = (
        "Return only a valid HTML fragment with no markdown fences or commentary. "
        "Preserve the existing structure and formatting tags whenever possible. "
        "Keep links, emphasis, headings, lists, and inline code as HTML."
    )

    if task == "rewrite":
        system = f"You are a professional writing assistant. Improve clarity and flow. {html_rules}"
        user = f"Rewrite this text.\n\nText:\n{selection}"
    elif task == "summarize":
        system = f"You are a concise summarization assistant. {html_rules}"
        user = f"Summarize this text.\n\nText:\n{selection}"
    elif task == "translate":
        system = f"You are a professional translator. Keep HTML intact. {html_rules}"
        user = f"Translate this text to {language or 'English'}.\n\nText:\n{selection}"
    elif task == "grammar":
        system = f"You are a grammar assistant. Fix grammar and punctuation. {html_rules}"
        user = f"Fix the grammar in this text.\n\nText:\n{selection}"
    elif task == "restructure":
        system = f"You are a document structure assistant. Reorganize the text for clarity. {html_rules}"
        user = f"Restructure this text.\n\nText:\n{selection}"
    elif task == "analyze":
        system = "You are an analytical assistant. Analyze themes, argument strength, and improvement areas."
        user = f"Analyze this text.\n\nText:\n{selection}"
    else:
        system = "You are an explanation assistant. Explain technical or complex text simply."
        user = f"Explain this text in simple terms.\n\nText:\n{selection}"

    if selection_html and task in {"rewrite", "summarize", "translate", "grammar", "restructure"}:
        user += f"\n\nHTML fragment:\n{selection_html}"

    return system, user


def estimate_tokens(text: str) -> int:
    return max(1, (len(text) + 3) // 4)


def get_mock_response(task: str, selection: str, language: str | None) -> str:
    mock_responses = {
        "rewrite": f"[Rewritten] {selection[:200]}... (improved for clarity and flow)",
        "summarize": "Summary:\n- Key point from the text\n- Another important point\n- Overall conclusion",
        "translate": f"[Translated to {language or 'English'}] {selection[:200]}...",
        "grammar": f"{selection.strip()} [grammar corrected]",
        "restructure": f"## Main Section\n\n{selection[:100]}...\n\n## Details\n\nAdditional restructured content.",
        "analyze": "Analysis:\n- Theme: Core ideas are identified\n- Strength: Structure is coherent\n- Suggestion: Add stronger evidence",
        "explain": f"In simple terms: {selection[:150]}... This content is explaining the idea more clearly.",
    }
    return mock_responses[task]


async def stream_mock_response(result: str) -> AsyncIterator[str]:
    chunk_size = 24
    for index in range(0, len(result), chunk_size):
        await asyncio.sleep(0.04)
        yield result[index : index + chunk_size]


async def stream_ai_response(
    task: str,
    selection: str,
    selection_html: str | None = None,
    language: str | None = None,
) -> tuple[str, int, AsyncIterator[str]]:
    settings = get_settings()
    system, user = build_prompt(task, selection, selection_html, language)
    input_tokens = estimate_tokens(f"{system}\n{user}")
    model = MODEL_FOR_TASK.get(task, settings.groq_default_model)

    if not settings.groq_api_key:
        result = get_mock_response(task, selection, language)
        return "mock", input_tokens, stream_mock_response(result)

    async def groq_stream() -> AsyncIterator[str]:
        headers = {
            "Authorization": f"Bearer {settings.groq_api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": 2048,
            "temperature": 0.7,
            "stream": True,
        }

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                "https://api.groq.com/openai/v1/chat/completions",
                headers=headers,
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    raw = line[6:].strip()
                    if raw == "[DONE]":
                        break
                    try:
                        payload = httpx.Response(200, text=raw).json()
                    except Exception:
                        continue
                    delta = (
                        payload.get("choices", [{}])[0]
                        .get("delta", {})
                        .get("content")
                    )
                    if delta:
                        yield str(delta)

    return model, input_tokens, groq_stream()

