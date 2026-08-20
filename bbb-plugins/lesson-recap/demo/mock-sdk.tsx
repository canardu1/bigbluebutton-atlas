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
 *
 * Two scenarios: the default lesson one, and a work-meeting one served at
 * `?scenario=meeting` (meeting transcript with owners and deadlines, panel
 * defaulting to the minutes mode).
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

const IS_MEETING_SCENARIO = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('scenario') === 'meeting';

const SETTINGS = {
  recapProxyUrl: 'http://localhost:8000',
  defaultRecapMode: IS_MEETING_SCENARIO ? 'meeting' as const : 'lesson' as const,
};

const LESSON_TRANSCRIPT: string[] = [
  'Good morning everyone and welcome to the lesson on photosynthesis.',
  'Photosynthesis takes place in the chloroplast of the plant cell.',
  'The chlorophyll captures light energy and converts it into chemical energy.',
  'The Calvin cycle then fixes carbon dioxide into glucose.',
  'For next week, read chapter four and complete the lab report.',
  'Remember to bring the leaf samples for the microscope session.',
];

const MEETING_TRANSCRIPT: string[] = [
  'Good morning, this is the weekly sync on the checkout migration.',
  'We agreed to postpone the payment provider switch to the next quarter.',
  'Marco will prepare the migration report by Friday.',
  'Giulia takes the load tests on the staging environment before the release.',
  'We decided to keep the legacy API online until the end of October.',
  'Still open: who owns the rollback plan, we will pick that up next week.',
];

const TRANSCRIPT = IS_MEETING_SCENARIO ? MEETING_TRANSCRIPT : LESSON_TRANSCRIPT;

const SLIDES = IS_MEETING_SCENARIO
  ? ['/meeting-slide-1.txt', '/meeting-slide-2.txt']
  : ['/slide-1.txt', '/slide-2.txt'];

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
  useMeetingData: () => ({
    data: {
      meetingId: 'demo-meeting',
      name: IS_MEETING_SCENARIO ? 'Checkout migration weekly' : 'Biology 101',
    },
  }),
  useCurrentPresentation: () => {
    const count = useLessonProgress();
    const slide = count > SLIDE_SWITCH_AFTER_LINES ? SLIDES[1] : SLIDES[0];
    return { data: { currentPage: { urlsJson: { text: slide } } } };
  },
  useUiData: () => ({ locale: LOCALE }),
  useCustomSubscription: <T, >() => ({ data: { caption: useRollingCaptions() } as unknown as T }),
};

export const BbbPluginSdk = {
  initialize: (): void => undefined,
  getPluginApi: (): PluginApi => pluginApi,
};
