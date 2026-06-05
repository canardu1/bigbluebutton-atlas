"""Backend proxy for the BigBlueButton contextual-chatbot plugin.

The browser plugin never sees the DeepSeek API key. It sends the student's
question plus the lesson context (live transcript, public chat, current slide
text) gathered client-side; this proxy merges in any teacher-provided reference
materials for the meeting, builds the prompt, and calls the DeepSeek
chat-completions API (OpenAI-compatible).
"""
from __future__ import annotations

import os
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
REQUEST_TIMEOUT_SECONDS = float(os.environ.get("DEEPSEEK_TIMEOUT", "60"))
MAX_CONTEXT_CHARS = int(os.environ.get("CHATBOT_MAX_CONTEXT_CHARS", "8000"))

app = FastAPI(title="Contextual Chatbot Proxy", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory per-meeting reference materials uploaded by the teacher.
# Keyed by meetingId. Replace with a shared store if running multiple replicas.
_materials_store: dict[str, str] = {}


class ChatContext(BaseModel):
    transcript: Optional[str] = None
    chat: Optional[str] = None
    slideText: Optional[str] = None
    materials: Optional[str] = None


class ChatRequest(BaseModel):
    meetingId: str
    question: str
    language: Optional[str] = None
    context: ChatContext = ChatContext()


class ChatReply(BaseModel):
    answer: str


class MaterialsRequest(BaseModel):
    meetingId: str
    text: str


def _clip(text: Optional[str], limit: int) -> str:
    if not text:
        return ""
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[-limit:]


def _build_messages(req: ChatRequest) -> list[dict[str, str]]:
    language = (req.language or "the same language as the question").strip()
    stored_materials = _materials_store.get(req.meetingId, "")
    materials = req.context.materials or stored_materials

    system = (
        "You are a helpful teaching assistant embedded in a live online class. "
        "Students ask you questions so they do NOT have to interrupt the teacher. "
        "Answer ONLY using the provided lesson context (transcript of what the "
        "teacher said, public chat, current slide text, and reference materials). "
        "If the answer is not contained in or inferable from the context, say you "
        "don't have that information from the lesson yet, and suggest asking the "
        "teacher. Be concise and clear. "
        f"Write your answer in this language: {language}."
    )

    context_parts: list[str] = []
    transcript = _clip(req.context.transcript, MAX_CONTEXT_CHARS)
    if transcript:
        context_parts.append(f"[Live transcript of the teacher]\n{transcript}")
    slide_text = _clip(req.context.slideText, MAX_CONTEXT_CHARS // 2)
    if slide_text:
        context_parts.append(f"[Current slide text]\n{slide_text}")
    chat = _clip(req.context.chat, MAX_CONTEXT_CHARS // 2)
    if chat:
        context_parts.append(f"[Public chat]\n{chat}")
    materials = _clip(materials, MAX_CONTEXT_CHARS)
    if materials:
        context_parts.append(f"[Teacher reference materials]\n{materials}")

    context_blob = "\n\n".join(context_parts) or "(no lesson context captured yet)"

    user = (
        f"Lesson context:\n{context_blob}\n\n"
        f"Student question: {req.question.strip()}"
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "model": DEEPSEEK_MODEL, "keyConfigured": bool(DEEPSEEK_API_KEY)}


@app.post("/materials")
def save_materials(req: MaterialsRequest) -> dict[str, object]:
    text = req.text.strip()
    if text:
        _materials_store[req.meetingId] = text
    else:
        _materials_store.pop(req.meetingId, None)
    return {"status": "ok", "length": len(text)}


@app.get("/materials/{meeting_id}")
def get_materials(meeting_id: str) -> dict[str, str]:
    return {"meetingId": meeting_id, "text": _materials_store.get(meeting_id, "")}


@app.post("/chat", response_model=ChatReply)
async def chat(req: ChatRequest) -> ChatReply:
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=503, detail="DEEPSEEK_API_KEY is not configured on the proxy.")
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question must not be empty.")

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": _build_messages(req),
        "stream": False,
        "temperature": 0.2,
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.post(
                f"{DEEPSEEK_BASE_URL.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach DeepSeek: {exc}") from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"DeepSeek responded {response.status_code}: {response.text}",
        )

    data = response.json()
    try:
        answer = data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Unexpected response from DeepSeek.") from exc

    return ChatReply(answer=answer)
