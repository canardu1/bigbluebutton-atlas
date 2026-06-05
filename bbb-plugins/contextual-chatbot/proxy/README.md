# Contextual Chatbot Proxy

FastAPI backend for the `contextual-chatbot` BigBlueButton plugin. It keeps the
**DeepSeek API key server-side** so it is never exposed to meeting participants.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness + whether the key is configured |
| `POST` | `/chat` | `{ meetingId, question, language?, context }` → `{ answer }` |
| `POST` | `/materials` | `{ meetingId, text }` — teacher reference notes (in-memory, per meeting) |
| `GET` | `/materials/{meetingId}` | Read stored materials |

`context` is `{ transcript?, chat?, slideText?, materials? }`. The proxy merges
the meeting's stored teacher materials into the prompt automatically.

## Run locally

```bash
cd proxy
python -m venv .venv && source .venv/bin/activate
pip install -e .
export DEEPSEEK_API_KEY=sk-...        # never commit this
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Configuration (env vars)

- `DEEPSEEK_API_KEY` (required) — your DeepSeek key.
- `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`)
- `DEEPSEEK_MODEL` (default `deepseek-chat`)
- `DEEPSEEK_TIMEOUT` (default `60` seconds)
- `CHATBOT_MAX_CONTEXT_CHARS` (default `8000`)

## Notes

- Materials are stored in process memory. For multi-replica deployments, back
  this with a shared store (Redis/DB).
- DeepSeek is OpenAI-compatible; the proxy calls `POST /chat/completions`.
