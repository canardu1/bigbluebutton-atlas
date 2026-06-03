import * as React from 'react';
import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import {
  BbbPluginSdk,
  PluginApi,
  CustomSubscriptionHookOptions,
  IntlLocaleUiDataNames,
  pluginLogger,
} from 'bigbluebutton-html-plugin-sdk';
import {
  ACTIVE_LOCALES_SUBSCRIPTION,
  ActiveLocalesResponse,
  CaptionRow,
  LIVE_CAPTIONS_SUBSCRIPTION,
  LiveCaptionsResponse,
} from './queries';
import {
  FALLBACK_LANGUAGES,
  LibreLanguage,
  fetchSupportedLanguages,
  toLibreCode,
  translateText,
} from '../../services/libretranslate';
import { CaptionsPanelProps, PluginSettings } from './types';

const DEFAULT_LIBRETRANSLATE_URL = 'https://libretranslate.com';
const TRANSLATE_DEBOUNCE_MS = 500;
const MAX_VISIBLE_LINES = 40;

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    fontFamily: 'inherit',
    color: '#0f172a',
    background: '#ffffff',
  },
  header: {
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  selectRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: 600,
  },
  select: {
    flex: 1,
    padding: '0.3rem',
    borderRadius: '0.25rem',
    border: '1px solid #cbd5e1',
    fontSize: '0.85rem',
  },
  meta: {
    fontSize: '0.7rem',
    color: '#64748b',
  },
  error: {
    fontSize: '0.7rem',
    color: '#b91c1c',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '0.5rem 0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  line: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.1rem',
  },
  speaker: {
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  translated: {
    fontSize: '0.95rem',
    lineHeight: 1.3,
  },
  original: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  empty: {
    margin: 'auto',
    color: '#94a3b8',
    fontSize: '0.85rem',
    textAlign: 'center',
    padding: '1rem',
  },
};

export function CaptionsPanel({ uuid }: CaptionsPanelProps): React.ReactElement {
  const pluginApi: PluginApi = BbbPluginSdk.getPluginApi(uuid);

  const settingsResponse = pluginApi.usePluginSettings();
  const settings = settingsResponse?.data as PluginSettings | undefined;
  const baseUrl = settings?.libreTranslateUrl || DEFAULT_LIBRETRANSLATE_URL;
  const apiKey = settings?.apiKey;

  const currentLocale = pluginApi.useUiData(
    IntlLocaleUiDataNames.CURRENT_LOCALE,
    { locale: 'en', fallbackLocale: 'en' },
  );

  const { data: liveData } = pluginApi.useCustomSubscription<LiveCaptionsResponse>(
    LIVE_CAPTIONS_SUBSCRIPTION,
    {} as CustomSubscriptionHookOptions,
  );
  const { data: activeLocalesData } = pluginApi.useCustomSubscription<ActiveLocalesResponse>(
    ACTIVE_LOCALES_SUBSCRIPTION,
    {} as CustomSubscriptionHookOptions,
  );

  const [languages, setLanguages] = useState<LibreLanguage[]>(FALLBACK_LANGUAGES);
  const [targetLang, setTargetLang] = useState<string>(
    settings?.defaultTargetLanguage || toLibreCode(currentLocale?.locale) || 'en',
  );
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translationError, setTranslationError] = useState<string | null>(null);

  const cacheRef = useRef<Record<string, string>>({});
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const listRef = useRef<HTMLDivElement | null>(null);

  // Load the list of supported target languages from the server (best effort).
  useEffect(() => {
    let cancelled = false;
    fetchSupportedLanguages(baseUrl)
      .then((langs) => {
        if (!cancelled && langs.length > 0) setLanguages(langs);
      })
      .catch((error) => {
        pluginLogger.warn('Could not fetch LibreTranslate languages, using fallback', error);
      });
    return () => { cancelled = true; };
  }, [baseUrl]);

  const captions: CaptionRow[] = useMemo(
    () => (liveData?.caption ?? []).filter((c) => c.captionText?.trim()),
    [liveData],
  );

  // Translate captions into the selected target language (debounced per line).
  useEffect(() => {
    const timers = timersRef.current;
    captions.forEach((caption) => {
      const sourceCode = toLibreCode(caption.locale);
      const cacheKey = `${caption.captionId}|${targetLang}`;

      if (sourceCode === targetLang) {
        if (translations[cacheKey] !== caption.captionText) {
          setTranslations((prev) => ({ ...prev, [cacheKey]: caption.captionText }));
        }
        return;
      }

      if (cacheRef.current[cacheKey] === caption.captionText) return;

      if (timers[cacheKey]) clearTimeout(timers[cacheKey]);
      timers[cacheKey] = setTimeout(() => {
        translateText(baseUrl, caption.captionText, sourceCode, targetLang, apiKey)
          .then((translated) => {
            cacheRef.current[cacheKey] = caption.captionText;
            setTranslations((prev) => ({ ...prev, [cacheKey]: translated }));
            setTranslationError(null);
          })
          .catch((error) => {
            pluginLogger.error('LibreTranslate translation failed', error);
            setTranslationError(
              'Translation service unreachable. Showing original text. Check the LibreTranslate URL in the plugin settings.',
            );
          });
      }, TRANSLATE_DEBOUNCE_MS);
    });
  }, [captions, targetLang, baseUrl, apiKey, translations]);

  // Auto-scroll to the latest caption.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [captions, translations]);

  // Clear pending timers on unmount.
  useEffect(() => () => {
    Object.values(timersRef.current).forEach((t) => clearTimeout(t));
  }, []);

  const activeLocales = (activeLocalesData?.caption_activeLocales ?? [])
    .map((l) => l.locale)
    .filter(Boolean);

  const visibleCaptions = captions.slice(-MAX_VISIBLE_LINES);

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <div style={styles.selectRow}>
          <span style={styles.label}>Translate to</span>
          <select
            style={styles.select}
            value={targetLang}
            data-test="translationTargetLanguageSelect"
            onChange={(e) => setTargetLang(e.target.value)}
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
        <span style={styles.meta}>
          {activeLocales.length > 0
            ? `Transcribing: ${activeLocales.join(', ')}`
            : 'Waiting for live transcription… enable captions for the speaker.'}
        </span>
        {translationError ? <span style={styles.error}>{translationError}</span> : null}
      </div>

      <div style={styles.list} ref={listRef} data-test="translatedCaptionsList">
        {visibleCaptions.length === 0 ? (
          <div style={styles.empty}>
            No transcription yet. Once a participant&apos;s speech is being
            transcribed, the translated text will appear here in real time.
          </div>
        ) : (
          visibleCaptions.map((caption) => {
            const cacheKey = `${caption.captionId}|${targetLang}`;
            const translated = translations[cacheKey];
            const sourceCode = toLibreCode(caption.locale);
            const isSameLanguage = sourceCode === targetLang;
            return (
              <div style={styles.line} key={caption.captionId}>
                <span
                  style={{
                    ...styles.speaker,
                    color: caption.user?.color || '#0f172a',
                  }}
                >
                  {caption.user?.name || 'Unknown'}
                </span>
                <span style={styles.translated}>
                  {translated ?? caption.captionText}
                </span>
                {!isSameLanguage ? (
                  <span style={styles.original}>{caption.captionText}</span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default CaptionsPanel;
