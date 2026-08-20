/**
 * Mock of `bigbluebutton-html-plugin-sdk` for the demo harness.
 *
 * `webpack.demo.js` aliases the real SDK to this module so the real
 * `CaptionsPanel` can be rendered without a BigBlueButton server. Only the
 * hooks the panel actually uses are implemented; everything else is omitted on
 * purpose so that an accidental new dependency on the SDK fails loudly.
 */
import { useEffect, useState } from 'react';

export interface CustomSubscriptionHookOptions {
  variables?: Record<string, unknown>;
}

export const IntlLocaleUiDataNames = {
  CURRENT_LOCALE: 'CURRENT_LOCALE',
};

export const pluginLogger = {
  info: (...args: unknown[]): void => console.info('[plugin]', ...args),
  warn: (...args: unknown[]): void => console.warn('[plugin]', ...args),
  error: (...args: unknown[]): void => console.error('[plugin]', ...args),
  debug: (...args: unknown[]): void => console.debug('[plugin]', ...args),
};

/** Plugin settings normally injected by the BBB HTML5 client. */
const SETTINGS = {
  libreTranslateUrl: 'http://localhost:5000',
  defaultTargetLanguage: 'it',
};

/** Scripted lesson, revealed word by word to mimic live transcription. */
const SCRIPT: { captionId: string; text: string; speaker: string }[] = [
  {
    captionId: 'caption-1',
    speaker: 'Prof. Rossi',
    text: 'Good morning everyone and welcome to the lesson.',
  },
  {
    captionId: 'caption-2',
    speaker: 'Prof. Rossi',
    text: 'Today we are going to talk about photosynthesis.',
  },
  {
    captionId: 'caption-3',
    speaker: 'Prof. Rossi',
    text: 'Photosynthesis takes place in the chloroplast of the plant cell.',
  },
];

const WORD_INTERVAL_MS = 400;
const LINE_PAUSE_MS = 1500;

interface CaptionRow {
  captionId: string;
  captionText: string;
  locale: string;
  createdAt: string;
  user: { name: string; color: string; isModerator: boolean };
}

/**
 * Emits the scripted captions as a growing list, one word at a time, the way
 * BBB's live transcription updates a caption row while someone is speaking.
 */
function useScriptedCaptions(): CaptionRow[] {
  const [rows, setRows] = useState<CaptionRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let delay = 500;

    SCRIPT.forEach((line) => {
      const words = line.text.split(' ');
      words.forEach((_, index) => {
        timers.push(setTimeout(() => {
          if (cancelled) return;
          const partial = words.slice(0, index + 1).join(' ');
          setRows((prev) => {
            const next = prev.filter((r) => r.captionId !== line.captionId);
            next.push({
              captionId: line.captionId,
              captionText: partial,
              locale: 'en-US',
              createdAt: new Date().toISOString(),
              user: { name: line.speaker, color: '#7b1fa2', isModerator: true },
            });
            return next;
          });
        }, delay + index * WORD_INTERVAL_MS));
      });
      delay += words.length * WORD_INTERVAL_MS + LINE_PAUSE_MS;
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return rows;
}

/** Reproduces the async arrival of plugin settings in the real client. */
function useAsyncSettings(): { data: typeof SETTINGS } | undefined {
  const [settings, setSettings] = useState<typeof SETTINGS | undefined>(undefined);
  useEffect(() => {
    const timer = setTimeout(() => setSettings(SETTINGS), 300);
    return () => clearTimeout(timer);
  }, []);
  return settings ? { data: settings } : undefined;
}

export interface PluginApi {
  usePluginSettings: () => { data: typeof SETTINGS } | undefined;
  useUiData: (name: string, fallback: unknown) => { locale: string };
  useCustomSubscription: <T>(query: string, options?: CustomSubscriptionHookOptions)
  => { data: T | undefined };
}

const pluginApi: PluginApi = {
  usePluginSettings: useAsyncSettings,
  useUiData: () => ({ locale: 'en' }),
  useCustomSubscription: <T, >(query: string) => {
    const captions = useScriptedCaptions();
    if (query.includes('caption_activeLocales')) {
      return { data: { caption_activeLocales: [{ locale: 'en-US' }] } as unknown as T };
    }
    return { data: { caption: captions } as unknown as T };
  },
};

export const BbbPluginSdk = {
  initialize: (): void => undefined,
  getPluginApi: (): PluginApi => pluginApi,
};
