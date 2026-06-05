/**
 * Minimal client for a LibreTranslate-compatible HTTP API.
 * See https://github.com/LibreTranslate/LibreTranslate for the server.
 */

export interface LibreLanguage {
  code: string;
  name: string;
}

interface TranslateResponse {
  translatedText: string;
  detectedLanguage?: {
    confidence: number;
    language: string;
  };
}

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

/**
 * Normalizes a BBB caption locale (e.g. "en-US", "pt-BR") to the short ISO
 * code that LibreTranslate expects (e.g. "en", "pt").
 */
export const toLibreCode = (locale: string | undefined | null): string => {
  if (!locale) return 'auto';
  return locale.split(/[-_]/)[0].toLowerCase();
};

/**
 * Translates a single piece of text. Returns the translated string, or throws
 * on a transport/HTTP error so callers can decide how to surface it.
 */
export async function translateText(
  baseUrl: string,
  text: string,
  source: string,
  target: string,
  apiKey?: string,
): Promise<string> {
  const body: Record<string, string> = {
    q: text,
    source: source || 'auto',
    target,
    format: 'text',
  };
  if (apiKey) body.api_key = apiKey;

  const response = await fetch(`${trimTrailingSlash(baseUrl)}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`LibreTranslate responded ${response.status}: ${detail}`);
  }

  const data = (await response.json()) as TranslateResponse;
  return data.translatedText;
}

/**
 * Fetches the list of languages the server supports as translation targets.
 * Falls back to an empty array on error; callers should provide their own
 * fallback list.
 */
export async function fetchSupportedLanguages(
  baseUrl: string,
): Promise<LibreLanguage[]> {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}/languages`);
  if (!response.ok) {
    throw new Error(`LibreTranslate /languages responded ${response.status}`);
  }
  const data = (await response.json()) as LibreLanguage[];
  return data;
}

/**
 * Static fallback used when the server's /languages endpoint is unreachable.
 * Mirrors the common LibreTranslate language set.
 */
export const FALLBACK_LANGUAGES: LibreLanguage[] = [
  { code: 'en', name: 'English' },
  { code: 'it', name: 'Italiano' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'ru', name: 'Русский' },
  { code: 'ar', name: 'العربية' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'uk', name: 'Українська' },
];
