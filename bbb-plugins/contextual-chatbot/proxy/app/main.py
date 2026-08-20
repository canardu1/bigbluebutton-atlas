"""Shared DeepSeek backend proxy for the BigBlueButton AI plugins.

The browser plugins never see the DeepSeek API key. They send the lesson
context gathered client-side and this proxy builds the prompt and calls the
DeepSeek chat-completions API (OpenAI-compatible).

Endpoints:
- /chat   : contextual-chatbot plugin (student question + lesson context).
- /recap  : lesson-recap plugin (full transcript + slides -> structured
            summary, action items and flashcards in "lesson" mode, or
            meeting minutes with decisions and owners in "meeting" mode).
"""
from __future__ import annotations

import json
import os
from typing import Literal, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
REQUEST_TIMEOUT_SECONDS = float(os.environ.get("DEEPSEEK_TIMEOUT", "60"))
MAX_CONTEXT_CHARS = int(os.environ.get("CHATBOT_MAX_CONTEXT_CHARS", "8000"))

MAX_RECAP_CHARS = int(os.environ.get("RECAP_MAX_CONTEXT_CHARS", "24000"))

app = FastAPI(title="BBB DeepSeek Proxy", version="0.2.0")

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


class RecapRequest(BaseModel):
    meetingId: Optional[str] = None
    language: Optional[str] = None
    transcript: Optional[str] = None
    slides: Optional[str] = None
    # "lesson" produces study material, "meeting" produces minutes.
    mode: Literal["lesson", "meeting"] = "lesson"


class Flashcard(BaseModel):
    question: str
    answer: str


class ActionItem(BaseModel):
    text: str
    owner: Optional[str] = None
    due: Optional[str] = None


class RecapReply(BaseModel):
    summary: str
    actionItems: list[ActionItem]
    flashcards: list[Flashcard]
    decisions: list[str] = []


def _optional_str(value: object) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


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


JSON_SHAPE = (
    "Respond with a single JSON object and nothing else, using exactly this "
    'shape: {"summary": string, "decisions": string[], "actionItems": '
    '[{"text": string, "owner": string|null, "due": string|null}], '
    '"flashcards": [{"question": string, "answer": string}]}. '
)

LESSON_SYSTEM = (
    "You are an assistant that produces study material from a recorded "
    "online lesson. You are given the full transcript of what the teacher "
    "said and the text extracted from the lesson slides. Produce a concise "
    "recap that helps a student review the lesson. Base everything ONLY on "
    "the provided transcript and slides; do not invent facts that are not "
    "supported by them. "
    "{language_instruction} "
    + JSON_SHAPE
    + "The summary is a short paragraph (3-6 sentences). actionItems is a list "
    "of concrete next steps, homework or things to study (use [] if none); set "
    "owner and due to null unless the teacher named them explicitly. decisions "
    "is [] for a lesson. flashcards is a list of 3-8 question/answer pairs "
    "covering the key concepts. Keep questions and answers short."
)

MEETING_SYSTEM = (
    "You are an assistant that writes the minutes of a work meeting. You are "
    "given the transcript of what the participants said and the text of any "
    "shared slides. Base everything ONLY on the provided material; never "
    "invent a decision, an owner or a deadline that was not stated. "
    "{language_instruction} "
    + JSON_SHAPE
    + "The summary is a short paragraph (3-6 sentences) covering what the "
    "meeting was about and where it landed. decisions is the list of decisions "
    "actually taken, one short sentence each (use [] if none). actionItems is "
    "the list of commitments: text is what has to be done, owner is the name of "
    "the person who took it on (null if nobody was named), due is the deadline "
    "exactly as stated, e.g. 'next Friday' or '2026-09-01' (null if none was "
    "stated). flashcards is always [] for a meeting."
)


def _build_recap_messages(req: RecapRequest) -> list[dict[str, str]]:
    is_meeting = req.mode == "meeting"
    default_language = "the same language as the meeting" if is_meeting else "the same language as the lesson"
    language = (req.language or default_language).strip()
    language_instruction = f"Write all text in this language: {language}."

    # Plain replace, not str.format: the prompt contains literal JSON braces.
    template = MEETING_SYSTEM if is_meeting else LESSON_SYSTEM
    system = template.replace("{language_instruction}", language_instruction)

    transcript = _clip(req.transcript, MAX_RECAP_CHARS)
    slides = _clip(req.slides, MAX_RECAP_CHARS)

    context_parts: list[str] = []
    if transcript:
        context_parts.append(f"[{'Meeting' if is_meeting else 'Lesson'} transcript]\n{transcript}")
    if slides:
        context_parts.append(f"[Slides text]\n{slides}")
    context_blob = "\n\n".join(context_parts)

    material_label = "Meeting material" if is_meeting else "Lesson material"
    output_label = "minutes" if is_meeting else "recap"
    user = f"{material_label}:\n{context_blob}\n\nGenerate the {output_label} JSON now."

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def _parse_recap(content: str) -> RecapReply:
    """Parse the model output into a RecapReply, tolerating code fences."""
    text = content.strip()
    if text.startswith("```"):
        # Strip a leading ```json / ``` fence and the trailing fence.
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text[: -len("```")]
        text = text.strip()
    if not text.startswith("{"):
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start : end + 1]

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502, detail="DeepSeek did not return valid recap JSON."
        ) from exc

    summary = str(data.get("summary", "")).strip()

    decisions: list[str] = []
    for decision in data.get("decisions") or []:
        decision_str = str(decision).strip()
        if decision_str:
            decisions.append(decision_str)

    action_items: list[ActionItem] = []
    for item in data.get("actionItems") or []:
        # The model may answer with a plain string (lesson style) or with an
        # object carrying owner and deadline (meeting style).
        if isinstance(item, dict):
            text = str(item.get("text", "")).strip()
            owner = _optional_str(item.get("owner"))
            due = _optional_str(item.get("due"))
        else:
            text, owner, due = str(item).strip(), None, None
        if text:
            action_items.append(ActionItem(text=text, owner=owner, due=due))

    flashcards: list[Flashcard] = []
    for card in data.get("flashcards") or []:
        if not isinstance(card, dict):
            continue
        question = str(card.get("question", "")).strip()
        answer = str(card.get("answer", "")).strip()
        if question and answer:
            flashcards.append(Flashcard(question=question, answer=answer))

    if not summary and not action_items and not flashcards and not decisions:
        raise HTTPException(
            status_code=502, detail="DeepSeek returned an empty recap."
        )

    return RecapReply(
        summary=summary,
        actionItems=action_items,
        flashcards=flashcards,
        decisions=decisions,
    )


@app.post("/recap", response_model=RecapReply)
async def recap(req: RecapRequest) -> RecapReply:
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=503, detail="DEEPSEEK_API_KEY is not configured on the proxy.")
    if not (req.transcript or "").strip() and not (req.slides or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Provide at least a transcript or slide text to summarize.",
        )

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": _build_recap_messages(req),
        "stream": False,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
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
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="Unexpected response from DeepSeek.") from exc

    return _parse_recap(content)
