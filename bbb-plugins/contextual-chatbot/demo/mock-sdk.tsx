/**
 * Mock of `bigbluebutton-html-plugin-sdk` for the demo harness.
 *
 * `webpack.demo.js` aliases the real SDK to this module so the real
 * `ChatbotPanel` can be rendered without a BigBlueButton server, while still
 * talking to the real DeepSeek proxy. Only the hooks the panel uses are
 * implemented.
 *
 * Change the constants below to test other contexts: `IS_PRESENTER` toggles the
 * teacher-only materials UI, `LOCALE` drives the answer language.
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

const IS_PRESENTER = true;
const LOCALE = 'it';

const SETTINGS = {
  chatbotProxyUrl: 'http://localhost:8000',
  assistantName: 'Assistente della lezione',
};

/** Lesson transcript the assistant must ground its answers in. */
const TRANSCRIPT: string[] = [
  'Good morning everyone and welcome to the lesson.',
  'Today we are going to talk about photosynthesis.',
  'Photosynthesis takes place in the chloroplast of the plant cell.',
  'The chlorophyll captures light energy and converts it into chemical energy.',
];

const CHAT_MESSAGES = [
  {
    messageId: 'msg-1',
    message: 'Reminder: the lab report is due next Friday.',
    senderName: 'Prof. Rossi',
    senderRole: 'MODERATOR',
    createdAt: new Date().toISOString(),
  },
];

const LINE_INTERVAL_MS = 1200;

interface CaptionRow {
  captionId: string;
  captionText: string;
  locale: string;
  createdAt: string;
}

/** Reveals the scripted transcript line by line, like live transcription. */
function useScriptedCaptions(): CaptionRow[] {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const timer = setInterval(() => {
      setCount((prev) => (prev < TRANSCRIPT.length ? prev + 1 : prev));
    }, LINE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return TRANSCRIPT.slice(0, count).map((text, index) => ({
    captionId: `caption-${index + 1}`,
    captionText: text,
    locale: 'en-US',
    createdAt: new Date().toISOString(),
  }));
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
  useCurrentUser: () => { data: { presenter: boolean; role: string; name: string } };
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
  useCurrentUser: () => ({
    data: { presenter: IS_PRESENTER, role: IS_PRESENTER ? 'MODERATOR' : 'VIEWER', name: 'Prof. Rossi' },
  }),
  useMeetingData: () => ({ data: { meetingId: 'demo-meeting', name: 'Biology 101' } }),
  useCurrentPresentation: () => ({
    data: { currentPage: { urlsJson: { text: '/slide-text.txt' } } },
  }),
  useUiData: () => ({ locale: LOCALE }),
  useCustomSubscription: <T, >(query: string) => {
    const captions = useScriptedCaptions();
    if (query.includes('chat_message_public')) {
      return { data: { chat_message_public: CHAT_MESSAGES } as unknown as T };
    }
    return { data: { caption: captions } as unknown as T };
  },
};

export const BbbPluginSdk = {
  initialize: (): void => undefined,
  getPluginApi: (): PluginApi => pluginApi,
};
