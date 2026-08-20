---
name: testing-transcription-translation
description: Test the BigBlueButton Live Transcription + Translation plugin end-to-end. Use when verifying CaptionsPanel UI, LibreTranslate translation, or language-switch behaviour without a full BBB server.
---

# Testing the Live Transcription + Translation plugin

A full BBB 3.0 server cannot be run in the test environment, so the **real** `CaptionsPanel`
component (`src/components/captions-panel/component.tsx`) and `src/services/libretranslate.ts`
are tested in a standalone demo harness under `demo/` that aliases the plugin SDK to a mock
(`demo/mock-sdk.tsx`) feeding a live-updating fake `caption` GraphQL stream, pointed at a
**real** LibreTranslate.

The harness (`demo/`, `webpack.demo.js`) is committed. See the repo-wide skill
`.agents/skills/testing-bbb-plugins/SKILL.md` for the pattern shared by all plugins.

## Setup

1. Start LibreTranslate (Docker). Restrict languages for speed:
   ```bash
   docker run -d --name libretranslate -p 5000:5000 -e LT_LOAD_ONLY=en,it,es libretranslate/libretranslate
   # if the container already exists: docker start libretranslate
   ```
   Models take ~10-30s to load. Verify it is ready before testing:
   ```bash
   curl -s -X POST http://localhost:5000/translate -H 'Content-Type: application/json' \
     -d '{"q":"Good morning everyone","source":"en","target":"it","format":"text"}'
   # expect: {"translatedText":"Buongiorno a tutti"}
   ```
   LibreTranslate returns CORS `*`, so the browser demo can call it directly.

2. Serve the demo (webpack dev server on :4702, auto-recompiles on source edits):
   ```bash
   cd bbb-plugins/transcription-translation
   npm install && npm run demo
   ```
   Open http://localhost:4702/.

## What to verify (concrete expected values, en/it/es)

- **Live translation (default Italian):** first caption
  "Good morning everyone and welcome to the lesson." renders translated as
  **"Buongiorno a tutti e benvenuti alla lezione."** with the English original in grey italics
  beneath. Translated text MUST differ from the English (proves a real translate call, not echo).
  Translation is debounced 500ms and only fires after a line stops growing word-by-word, so
  wait ~2s after a line stabilises.
- **Switch target language:** change the "Translate to" `<select>` to Spanish; lines re-render as
  e.g. **"Buenos días a todos y bienvenidos a la lección."** (Spanish, not Italian). On switch the
  text briefly falls back to the English original until the new-language translations resolve.
- **Same source==target (English):** lines show a single English line with **no** grey-italic
  duplicate beneath.
- **Resilience:** `docker stop libretranslate`, then reload. The `<select>` falls back to the
  hardcoded 15-language list (native names) and a red banner appears:
  "Translation service unreachable. Showing original text...". Originals are shown; no crash.
  Restart with `docker start libretranslate` afterwards.

## Pre-checks (shell)

```bash
cd bbb-plugins/transcription-translation
npx tsc --noEmit && npm run lint && npm run build-bundle
```

## Out of scope here (needs a real BBB 3.0 server)

Nav-bar button opening the sidebar, real audio-caption transcription producing `caption` rows,
and manifest loading via `pluginManifests`. The mock SDK also returns settings synchronously,
so it does NOT reproduce the async-settings path behind `defaultTargetLanguage` — verify that
by code/build, not at runtime in the demo.

## Devin Secrets Needed

None. LibreTranslate runs locally with no API key.
