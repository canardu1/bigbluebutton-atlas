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
  LIVE_CAPTIONS_SUBSCRIPTION,
  LiveCaptionsResponse,
} from './queries';
import {
  generateRecap,
  fetchSlideText,
  recapToMarkdown,
  RecapData,
} from '../../services/recap';
import { RecapPanelProps, PluginSettings } from './types';

const DEFAULT_PROXY_URL = 'http://localhost:8000';

const toIsoLanguage = (locale: string | undefined | null): string => {
  if (!locale) return 'en';
  return locale.split(/[-_]/)[0].toLowerCase();
};

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
    gap: '0.3rem',
  },
  title: {
    fontSize: '0.95rem',
    fontWeight: 700,
  },
  meta: {
    fontSize: '0.7rem',
    color: '#64748b',
  },
  stats: {
    fontSize: '0.7rem',
    color: '#475569',
    display: 'flex',
    gap: '0.75rem',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '0.5rem 0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  empty: {
    margin: 'auto',
    color: '#94a3b8',
    fontSize: '0.85rem',
    textAlign: 'center',
    padding: '1rem',
  },
  sectionTitle: {
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#0f172a',
    margin: '0.25rem 0',
  },
  summary: {
    fontSize: '0.85rem',
    lineHeight: 1.4,
    whiteSpace: 'pre-wrap',
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '0.4rem',
    padding: '0.5rem',
  },
  actionList: {
    margin: 0,
    paddingLeft: '1.1rem',
    fontSize: '0.85rem',
    lineHeight: 1.4,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  cardGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  card: {
    border: '1px solid #cbd5e1',
    borderRadius: '0.5rem',
    padding: '0.6rem',
    background: '#ffffff',
    cursor: 'pointer',
    fontSize: '0.85rem',
    lineHeight: 1.35,
  },
  cardLabel: {
    fontSize: '0.62rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: '#2563eb',
    marginBottom: '0.2rem',
  },
  cardLabelAnswer: {
    color: '#15803d',
  },
  cardHint: {
    fontSize: '0.62rem',
    color: '#94a3b8',
    marginTop: '0.3rem',
  },
  footer: {
    borderTop: '1px solid #e2e8f0',
    padding: '0.5rem 0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  row: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  button: {
    padding: '0.45rem 0.8rem',
    borderRadius: '0.35rem',
    border: 'none',
    background: '#2563eb',
    color: 'white',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    flex: 1,
  },
  buttonSecondary: {
    background: '#e2e8f0',
    color: '#0f172a',
  },
  buttonDisabled: {
    background: '#94a3b8',
    cursor: 'not-allowed',
  },
  error: {
    background: '#fef2f2',
    color: '#b91c1c',
    padding: '0.4rem 0.6rem',
    borderRadius: '0.4rem',
    fontSize: '0.8rem',
  },
  status: {
    fontSize: '0.7rem',
    color: '#15803d',
  },
};

export function RecapPanel({ uuid }: RecapPanelProps): React.ReactElement {
  const pluginApi: PluginApi = BbbPluginSdk.getPluginApi(uuid);

  const settingsResponse = pluginApi.usePluginSettings();
  const settings = settingsResponse?.data as PluginSettings | undefined;
  const baseUrl = settings?.recapProxyUrl || settings?.chatbotProxyUrl || DEFAULT_PROXY_URL;

  const meetingData = pluginApi.useMeetingData();
  const currentPresentation = pluginApi.useCurrentPresentation();
  const currentLocale = pluginApi.useUiData(
    IntlLocaleUiDataNames.CURRENT_LOCALE,
    { locale: 'en', fallbackLocale: 'en' },
  );

  const { data: captionsData } = pluginApi.useCustomSubscription<LiveCaptionsResponse>(
    LIVE_CAPTIONS_SUBSCRIPTION,
    {} as CustomSubscriptionHookOptions,
  );

  // Accumulate the full lesson transcript: BBB's caption view is a rolling
  // window, so we keep every line we have ever seen, keyed by captionId.
  const transcriptMapRef = useRef<Map<string, string>>(new Map());
  const [transcript, setTranscript] = useState('');
  const [transcriptLines, setTranscriptLines] = useState(0);

  // Accumulate the text of every slide shown during the lesson, keyed by URL.
  const slidesMapRef = useRef<Map<string, string>>(new Map());
  const [slides, setSlides] = useState('');
  const [slideCount, setSlideCount] = useState(0);

  const [recap, setRecap] = useState<RecapData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const [status, setStatus] = useState<string | null>(null);

  const meetingId = meetingData?.data?.meetingId || 'unknown-meeting';
  const meetingName = meetingData?.data?.name || 'Lesson recap';
  const language = toIsoLanguage(currentLocale?.locale);

  useEffect(() => {
    const map = transcriptMapRef.current;
    let changed = false;
    (captionsData?.caption ?? []).forEach((c) => {
      const text = c.captionText?.trim();
      if (!text) return;
      if (map.get(c.captionId) !== text) {
        map.set(c.captionId, text);
        changed = true;
      }
    });
    if (changed) {
      const lines = Array.from(map.values()).filter(Boolean);
      setTranscript(lines.join('\n'));
      setTranscriptLines(lines.length);
    }
  }, [captionsData]);

  const slideTextUrl = currentPresentation?.data?.currentPage?.urlsJson?.text;
  useEffect(() => {
    let cancelled = false;
    if (!slideTextUrl) return undefined;
    if (slidesMapRef.current.has(slideTextUrl)) return undefined;
    // Reserve the slot immediately so concurrent renders don't refetch.
    slidesMapRef.current.set(slideTextUrl, '');
    fetchSlideText(slideTextUrl)
      .then((text) => {
        if (cancelled) return;
        slidesMapRef.current.set(slideTextUrl, text);
        const all = Array.from(slidesMapRef.current.values())
          .map((t) => t.trim())
          .filter(Boolean);
        setSlides(all.join('\n\n'));
        setSlideCount(all.length);
      })
      .catch((err) => {
        pluginLogger.warn('Could not fetch slide text for recap', err);
      });
    return () => { cancelled = true; };
  }, [slideTextUrl]);

  const hasContext = Boolean(transcript.trim() || slides.trim());

  const handleGenerate = async (): Promise<void> => {
    if (generating || !hasContext) return;
    setGenerating(true);
    setError(null);
    setStatus(null);
    setFlipped({});
    try {
      const result = await generateRecap(baseUrl, {
        meetingId,
        language,
        transcript,
        slides,
      });
      setRecap(result);
    } catch (err) {
      pluginLogger.error('Recap generation failed', err);
      setError('Could not generate the recap. Check that the proxy URL in the plugin settings is reachable.');
    } finally {
      setGenerating(false);
    }
  };

  const markdown = useMemo(
    () => (recap ? recapToMarkdown(recap, meetingName) : ''),
    [recap, meetingName],
  );

  const handleCopy = async (): Promise<void> => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setStatus('Recap copied to clipboard.');
    } catch (err) {
      pluginLogger.error('Copy to clipboard failed', err);
      setError('Clipboard is not available in this browser.');
    }
  };

  const handleDownload = (): void => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${meetingName.replace(/[^\w-]+/g, '_')}-recap.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatus('Recap downloaded as Markdown.');
  };

  const toggleCard = (index: number): void => {
    setFlipped((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const generateLabel = (() => {
    if (generating) return 'Generating…';
    return recap ? 'Regenerate recap' : 'Generate recap';
  })();

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <span style={styles.title}>Lesson recap</span>
        <span style={styles.meta}>
          Summarises the whole lesson from the accumulated transcript and slides.
        </span>
        <div style={styles.stats}>
          <span>{`${transcriptLines} transcript line(s)`}</span>
          <span>{`${slideCount} slide(s) captured`}</span>
        </div>
      </div>

      <div style={styles.body}>
        {error && <div style={styles.error}>{error}</div>}

        {!recap && !error && (
          <div style={styles.empty}>
            {hasContext
              ? 'Click “Generate recap” to build a summary, action items and flashcards from the lesson so far.'
              : 'Waiting for lesson content… the recap will use the transcript and slides captured during the session.'}
          </div>
        )}

        {recap && (
          <>
            <div>
              <div style={styles.sectionTitle}>Summary</div>
              <div style={styles.summary}>{recap.summary || 'No summary available.'}</div>
            </div>

            <div>
              <div style={styles.sectionTitle}>{`Action items (${recap.actionItems.length})`}</div>
              {recap.actionItems.length === 0 ? (
                <div style={styles.meta}>No action items were identified.</div>
              ) : (
                <ul style={styles.actionList}>
                  {recap.actionItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div style={styles.sectionTitle}>{`Flashcards (${recap.flashcards.length})`}</div>
              <div style={styles.cardGrid}>
                {recap.flashcards.map((card, index) => {
                  const isFlipped = Boolean(flipped[index]);
                  return (
                    <div
                      key={card.question}
                      style={styles.card}
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleCard(index)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleCard(index);
                        }
                      }}
                    >
                      <div
                        style={{
                          ...styles.cardLabel,
                          ...(isFlipped ? styles.cardLabelAnswer : {}),
                        }}
                      >
                        {isFlipped ? 'Answer' : 'Question'}
                      </div>
                      <div>{isFlipped ? card.answer : card.question}</div>
                      <div style={styles.cardHint}>
                        {isFlipped ? 'Click to see the question' : 'Click to reveal the answer'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <div style={styles.footer}>
        {status && <div style={styles.status}>{status}</div>}
        <button
          type="button"
          style={{
            ...styles.button,
            ...((generating || !hasContext) ? styles.buttonDisabled : {}),
          }}
          disabled={generating || !hasContext}
          onClick={handleGenerate}
        >
          {generateLabel}
        </button>
        {recap && (
          <div style={styles.row}>
            <button
              type="button"
              style={{ ...styles.button, ...styles.buttonSecondary }}
              onClick={handleCopy}
            >
              Copy Markdown
            </button>
            <button
              type="button"
              style={{ ...styles.button, ...styles.buttonSecondary }}
              onClick={handleDownload}
            >
              Download .md
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
