---
name: testing-bbb-plugins
description: Test the custom BigBlueButton HTML5 plugins in bbb-plugins/ end-to-end without a full BBB server, by rendering the real plugin component in a mock-SDK demo harness against the real backend. Use when verifying changes to transcription-translation or contextual-chatbot.
---

# Testing BBB plugins (demo-harness E2E)

These plugins live in `bbb-plugins/<plugin>/` and use the official
`bigbluebutton-html-plugin-sdk`. A full BBB 3.0 server is NOT available in CI, so
we test the **real plugin component** in a demo harness that aliases the SDK to a
mock (`demo/mock-sdk.tsx`) feeding live fake data, while talking to the **real**
backend.

## General pattern (applies to any plugin here)

1. `cd bbb-plugins/<plugin> && npm install`
2. Sanity: `npx tsc --noEmit`, `npm run lint`, `npm run build-bundle` must all pass.
3. Run the backend the plugin calls (see per-plugin notes below).
4. Start the demo harness: `npx webpack serve --config webpack.demo.js`
   (transcription-translation → port 4702, contextual-chatbot → port 4712).
5. Open the port in Chrome, maximize the window, then record the run.

The harness `webpack.demo.js` aliases `bigbluebutton-html-plugin-sdk` to
`demo/mock-sdk.tsx`. The mock implements only the hooks the panel uses
(`useCustomSubscription`, `usePluginSettings`, `useCurrentUser`, `useMeetingData`,
`useCurrentPresentation`, `useUiData`) and streams scripted captions/chat. To
change context (language, presenter role, slide text), edit the mock's return
values — e.g. `useUiData` returns `{ locale: 'it' }` to force Italian answers,
`useCurrentUser` returns `presenter: true` to reveal teacher-only UI.

## contextual-chatbot (DeepSeek)

- Backend proxy keeps the key server-side. Run it:
  ```bash
  cd bbb-plugins/contextual-chatbot/proxy
  python -m venv .venv && . .venv/bin/activate && pip install -e .
  DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY uvicorn app.main:app --port 8000
  ```
  `GET /health` should show `keyConfigured: true`.
- The mock SDK points `chatbotProxyUrl` at `http://localhost:8000` and feeds a
  photosynthesis transcript + slide text + a chat message.
- High-signal assertions (a broken context pipeline looks different):
  - In-context Q ("dove avviene la fotosintesi?") → answer names **cloroplasto** in the UI locale language.
  - Out-of-context Q ("capitale della Francia secondo la lezione?") → refuses / "non ho queste informazioni dalla lezione", NOT "Parigi".
  - Save teacher materials (e.g. "pagine 40-45"), then ask → answer cites 40-45 (proves `/materials` per-meeting merge).
  - Kill the proxy, ask → red bubble "The assistant is unreachable…", no crash.
- Security check: `grep -RF "$DEEPSEEK_API_KEY" dist/ demo-dist/` must find nothing — the key must never be in a browser bundle.
- The proxy's materials store is in-memory; restart uvicorn to reset it between runs.

## transcription-translation (LibreTranslate)

- Backend: a real LibreTranslate (Docker `libretranslate/libretranslate`, port 5000).
- Assertions: EN→IT/ES translation appears under the original; switching target
  language re-translates; same source==target shows no grey duplicate; with the
  translate backend down a red banner appears and originals still render.

## Gotchas / future-proofing

- `pip install -e .` creates a `*.egg-info/` dir — keep it gitignored; don't commit it.
- The demo build uses `transpileOnly` (ts-loader), so SDK type-only exports in the
  mock don't need real implementations.
- If the answer comes back in the wrong language, check the mock's `useUiData`
  locale and the proxy's system prompt (`language` field), not the network layer.
- Real BBB-server behaviors (nav-bar button, real captions, manifest load,
  GraphQL views) can't be verified in the harness — call these out as untested.

## Devin Secrets Needed

- `DEEPSEEK_API_KEY` — required to run the contextual-chatbot proxy against real DeepSeek.
