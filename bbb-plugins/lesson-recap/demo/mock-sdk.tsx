/**
 * Mock of `bigbluebutton-html-plugin-sdk` for the demo harness.
 *
 * `webpack.demo.js` aliases the real SDK to this module so the real
 * `RecapPanel` can be rendered without a BigBlueButton server, while still
 * talking to the real DeepSeek proxy.
 *
 * The caption stream deliberately behaves like BBB's `caption` view: it is a
 * ROLLING WINDOW of the most recent lines. Early lines disappear from the
 * subscription, so a recap that still mentions them proves the panel's
 * client-side accumulation works.
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

const LOCALE = 'it';
const WINDOW_SIZE = 2;
const LINE_INTERVAL_MS = 1200;
/** The second slide starts being presented after this many lines. */
const SLIDE_SWITCH_AFTER_LINES = 4;

const SETTINGS = {
  recapProxyUrl: 'http://localhost:8000',
};

const TRANSCRIPT: string[] = [
  'Good morning everyone and welcome to the lesson on photosynthesis.',
  'Photosynthesis takes place in the chloroplast of the plant cell.',
  'The chlorophyll captures light energy and converts it into chemical energy.',
  'The Calvin cycle then fixes carbon dioxide into glucose.',
  'For next week, read chapter four and complete the lab report.',
  'Remember to bring the leaf samples for the microscope session.',
];

interface CaptionRow {
  captionId: string;
  captionText: string;
  locale: string;
  createdAt: string;
}

/** Number of transcript lines emitted so far, one every LINE_INTERVAL_MS. */
function useLessonProgress(): number {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const timer = setInterval(() => {
      setCount((prev) => (prev < TRANSCRIPT.length ? prev + 1 : prev));
    }, LINE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  return count;
}

function useRollingCaptions(): CaptionRow[] {
  const count = useLessonProgress();
  return TRANSCRIPT.slice(0, count)
    .map((text, index) => ({
      captionId: `caption-${index + 1}`,
      captionText: text,
      locale: 'en-US',
      createdAt: new Date().toISOString(),
    }))
    .slice(-WINDOW_SIZE);
}

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
  useMeetingData: () => { data: { meetingId: string; name: string } };
  useCurrentPresentation: () => {
    data: { currentPage: { urlsJson: { text: string } } };
  };
  useUiData: (name: string, fallback: unknown) => { locale: string };
  useCustomSubscription: <T>(query: string, options?: CustomSubscriptionHookOptions)
  => { data: T | undefined };
}

const pluginApi: PluginApi = {
  usePluginSettings: useAsyncSettings,
  useMeetingData: () => ({ data: { meetingId: 'demo-meeting', name: 'Biology 101' } }),
  useCurrentPresentation: () => {
    const count = useLessonProgress();
    const slide = count > SLIDE_SWITCH_AFTER_LINES ? '/slide-2.txt' : '/slide-1.txt';
    return { data: { currentPage: { urlsJson: { text: slide } } } };
  },
  useUiData: () => ({ locale: LOCALE }),
  useCustomSubscription: <T, >() => ({ data: { caption: useRollingCaptions() } as unknown as T }),
};

export const BbbPluginSdk = {
  initialize: (): void => undefined,
  getPluginApi: (): PluginApi => pluginApi,
};
