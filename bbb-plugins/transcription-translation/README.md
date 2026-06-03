# Transcription + Translation Plugin

A BigBlueButton 3.0 HTML5 plugin that **reuses BigBlueButton's built-in live
transcription** (audio captions) and adds **live translation** powered by a
[LibreTranslate](https://github.com/LibreTranslate/LibreTranslate)-compatible
server.

Each participant can pick their own target language. Incoming captions are
translated client-side and shown in a sidebar panel together with the original
text, updating in real time.

## How it works

1. A speaker enables BigBlueButton's audio captions (Settings → enable
   automatic transcription). BBB writes the recognized text to the `caption`
   GraphQL view.
2. The plugin subscribes to that view via the SDK's `useCustomSubscription`
   hook — no changes to BigBlueButton core are required.
3. For every new caption line, the plugin calls `POST {url}/translate` on the
   configured LibreTranslate server, translating from the caption's source
   locale into the viewer's selected language.
4. The translated text (plus the original) is rendered in the **Live
   Translation** sidebar panel. A nav-bar button opens the panel.

Because translation happens per viewer, two people in the same meeting can read
the same speaker in two different languages.

## Configuration

The plugin reads its settings from `meeting_clientPluginSettings`
(`usePluginSettings`). Configure them in the plugin manifest reference inside
`bbb-web.properties` / the `/create` call:

```
pluginManifests=[{
  "url": "https://<your-host>/plugins/transcriptionTranslation/manifest.json",
  "settings": {
    "TranscriptionTranslationPlugin": {
      "libreTranslateUrl": "https://translate.example.com",
      "apiKey": "<optional LibreTranslate api key>",
      "defaultTargetLanguage": "it"
    }
  }
}]
```

| Setting | Default | Description |
| --- | --- | --- |
| `libreTranslateUrl` | `https://libretranslate.com` | Base URL of the LibreTranslate server. |
| `apiKey` | _(none)_ | Optional API key sent as `api_key`. |
| `defaultTargetLanguage` | viewer's UI locale | ISO code (e.g. `it`, `en`, `es`) preselected in the language picker. |

> **Tip:** the easiest way to get a working translation backend is to
> self-host LibreTranslate: `docker run -p 5000:5000 libretranslate/libretranslate`,
> then set `libreTranslateUrl` to `http://<host>:5000`.

## Development

```bash
cd bbb-plugins/transcription-translation
npm install
npm start          # serves the bundle + manifest on http://<host>:4701
```

Expose the dev server to your BBB server (e.g. via ngrok) and add the manifest
URL to the `/create` call's `pluginManifests` parameter. See
`docs/docs/plugins.md` for the full plugin loading guide.

## Production build

```bash
npm ci
npm run build-bundle   # produces dist/TranscriptionTranslationPlugin.js + manifest.json
```

Host the contents of `dist/` on any HTTPS server (or copy them under
`/var/www/bigbluebutton-default/assets/plugins/transcriptionTranslation/` on the
BBB server) and reference the resulting `manifest.json` URL.
