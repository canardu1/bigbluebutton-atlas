# Contextual Chatbot plugin (DeepSeek)

A BigBlueButton 3.0 HTML5 plugin that adds an **AI assistant students can ask
questions to without interrupting the teacher**. The assistant answers using the
**lesson context**: the live transcription (audio captions), the public chat, the
current slide's text, and reference materials the teacher provides.

The DeepSeek API key is **never** shipped to the browser. The plugin talks to a
small [backend proxy](./proxy) that holds the key server-side and calls DeepSeek.

## How it works

- A nav-bar button and an **"Ask AI"** sidebar panel (`GenericContentSidekickArea`).
- Students type a question → the plugin gathers context client-side:
  - last ~40 transcription lines (`caption` subscription),
  - last ~30 public chat messages (`chat_message_public` subscription),
  - the current slide text (`useCurrentPresentation().currentPage.urlsJson.text`),
  - and sends `{ meetingId, question, language, context }` to the proxy `POST /chat`.
- The proxy merges in teacher materials for the meeting, prompts DeepSeek, and
  returns the answer, which is rendered in the conversation.
- Presenters/moderators see a **"reference materials"** box that uploads notes to
  the proxy (`POST /materials`) so every answer can use them.

The answer is written in the viewer's UI language (`CURRENT_LOCALE`).

## Settings

Provided via `meeting_clientPluginSettings` / `usePluginSettings`:

| Setting | Default | Description |
| --- | --- | --- |
| `chatbotProxyUrl` | `http://localhost:8000` | Base URL of the proxy backend |
| `assistantName` | `AI assistant` | Display name shown in the panel |

## Build

```bash
cd bbb-plugins/contextual-chatbot
npm ci && npm run build-bundle
# outputs dist/ContextualChatbotPlugin.js + dist/manifest.json
```

Host the bundle + manifest, run the [proxy](./proxy) with your `DEEPSEEK_API_KEY`,
and reference the manifest in your `/create` call (pointing `chatbotProxyUrl` at
the proxy). See the proxy README for backend setup.
