# Lesson Recap plugin (DeepSeek)

A BigBlueButton 3.0 plugin that, at the end of a lesson, generates a structured
**recap** from what actually happened in the session:

- a concise **summary**,
- a list of **action items** (homework, next steps),
- a set of **flashcards** (question / answer) for revision,

with **copy to Markdown** and **download as `.md`**.

The recap is produced by DeepSeek. The API key never reaches the browser: the
plugin talks to the same backend **proxy** used by the contextual-chatbot
plugin, which keeps the key server-side (see
[`../contextual-chatbot/proxy`](../contextual-chatbot/proxy)).

## How context is gathered

BigBlueButton's `caption` GraphQL view is a **rolling window** of the most
recent transcription lines, and the full list of slide texts is presenter
restricted. So the panel **accumulates** context client-side throughout the
lesson:

- every transcription line it ever sees is stored (keyed by `captionId`), so the
  recap covers the whole lesson, not just the last few seconds;
- the extracted text of every slide that is shown is fetched and stored (keyed
  by its text URL).

When the user clicks **Generate recap**, the accumulated transcript + slides are
sent to the proxy's `/recap` endpoint, which prompts DeepSeek for structured
JSON (`{ summary, actionItems[], flashcards[{question, answer}] }`).

## Backend proxy

This plugin reuses the shared DeepSeek proxy from the contextual-chatbot plugin.
It adds a `POST /recap` endpoint. Run it with the `DEEPSEEK_API_KEY` environment
variable set:

```bash
cd ../contextual-chatbot/proxy
python -m venv .venv && source .venv/bin/activate
pip install -e .
export DEEPSEEK_API_KEY=sk-...        # never commit this
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`POST /recap` request body:

```json
{
  "meetingId": "abc",
  "language": "it",
  "transcript": "full accumulated transcript...",
  "slides": "all slide texts..."
}
```

Response:

```json
{
  "summary": "…",
  "actionItems": ["…"],
  "flashcards": [{ "question": "…", "answer": "…" }]
}
```

## Build

```bash
npm install
npm run build-bundle      # produces dist/LessonRecapPlugin.js + dist/manifest.json
npm run lint
```

Host `dist/LessonRecapPlugin.js` and `dist/manifest.json` somewhere reachable by
your BBB server and register the manifest URL via `pluginManifests` in the
meeting create parameters (same mechanism as the other plugins in this repo).

### Plugin settings

| Setting          | Default                  | Description                                  |
| ---------------- | ------------------------ | -------------------------------------------- |
| `recapProxyUrl`  | `http://localhost:8000`  | Base URL of the DeepSeek proxy backend.      |
| `chatbotProxyUrl`| –                        | Fallback if `recapProxyUrl` is not set (the chatbot and recap plugins share one proxy). |
