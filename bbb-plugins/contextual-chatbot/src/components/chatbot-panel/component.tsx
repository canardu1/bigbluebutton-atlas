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
  PUBLIC_CHAT_SUBSCRIPTION,
  PublicChatResponse,
} from './queries';
import { askChatbot, fetchSlideText, uploadMaterials } from '../../services/chatbot';
import { ChatbotPanelProps, PluginSettings, QaTurn } from './types';

const DEFAULT_PROXY_URL = 'http://localhost:8000';
const MAX_TRANSCRIPT_LINES = 40;
const MAX_CHAT_MESSAGES = 30;

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
  list: {
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
  turn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },
  question: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    background: '#2563eb',
    color: 'white',
    padding: '0.4rem 0.6rem',
    borderRadius: '0.6rem 0.6rem 0 0.6rem',
    fontSize: '0.85rem',
    whiteSpace: 'pre-wrap',
  },
  answer: {
    alignSelf: 'flex-start',
    maxWidth: '90%',
    background: '#f1f5f9',
    color: '#0f172a',
    padding: '0.4rem 0.6rem',
    borderRadius: '0.6rem 0.6rem 0.6rem 0',
    fontSize: '0.9rem',
    lineHeight: 1.35,
    whiteSpace: 'pre-wrap',
  },
  answerPending: {
    alignSelf: 'flex-start',
    color: '#64748b',
    fontStyle: 'italic',
    fontSize: '0.85rem',
  },
  answerError: {
    alignSelf: 'flex-start',
    maxWidth: '90%',
    background: '#fef2f2',
    color: '#b91c1c',
    padding: '0.4rem 0.6rem',
    borderRadius: '0.6rem',
    fontSize: '0.85rem',
  },
  composer: {
    borderTop: '1px solid #e2e8f0',
    padding: '0.5rem 0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  textarea: {
    width: '100%',
    resize: 'none',
    padding: '0.4rem',
    borderRadius: '0.35rem',
    border: '1px solid #cbd5e1',
    fontSize: '0.85rem',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  row: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  button: {
    padding: '0.4rem 0.8rem',
    borderRadius: '0.35rem',
    border: 'none',
    background: '#2563eb',
    color: 'white',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  buttonDisabled: {
    background: '#94a3b8',
    cursor: 'not-allowed',
  },
  teacherBox: {
    borderTop: '1px solid #e2e8f0',
    padding: '0.5rem 0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.35rem',
    background: '#f8fafc',
  },
  teacherLabel: {
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#0f172a',
  },
  teacherHint: {
    fontSize: '0.68rem',
    color: '#64748b',
  },
  statusOk: {
    fontSize: '0.7rem',
    color: '#15803d',
  },
  statusErr: {
    fontSize: '0.7rem',
    color: '#b91c1c',
  },
};

export function ChatbotPanel({ uuid }: ChatbotPanelProps): React.ReactElement {
  const pluginApi: PluginApi = BbbPluginSdk.getPluginApi(uuid);

  const settingsResponse = pluginApi.usePluginSettings();
  const settings = settingsResponse?.data as PluginSettings | undefined;
  const baseUrl = settings?.chatbotProxyUrl || DEFAULT_PROXY_URL;
  const assistantName = settings?.assistantName || 'AI assistant';

  const currentUser = pluginApi.useCurrentUser();
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
  const { data: chatData } = pluginApi.useCustomSubscription<PublicChatResponse>(
    PUBLIC_CHAT_SUBSCRIPTION,
    {} as CustomSubscriptionHookOptions,
  );

  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<QaTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [slideText, setSlideText] = useState('');

  const [materialsText, setMaterialsText] = useState('');
  const [materialsStatus, setMaterialsStatus] = useState<
    { kind: 'ok' | 'err'; message: string } | null
  >(null);
  const [savingMaterials, setSavingMaterials] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);

  const meetingId = meetingData?.data?.meetingId || 'unknown-meeting';
  const isPresenter = Boolean(
    currentUser?.data?.presenter || currentUser?.data?.role === 'MODERATOR',
  );
  const language = toIsoLanguage(currentLocale?.locale);

  // Fetch the current slide's extracted text whenever the presented page changes.
  const slideTextUrl = currentPresentation?.data?.currentPage?.urlsJson?.text;
  useEffect(() => {
    let cancelled = false;
    if (!slideTextUrl) {
      setSlideText('');
      return undefined;
    }
    fetchSlideText(slideTextUrl)
      .then((text) => { if (!cancelled) setSlideText(text); })
      .catch((error) => {
        pluginLogger.warn('Could not fetch slide text for chatbot context', error);
      });
    return () => { cancelled = true; };
  }, [slideTextUrl]);

  const transcriptContext = useMemo(() => {
    const lines = (captionsData?.caption ?? [])
      .map((c) => c.captionText?.trim())
      .filter((t): t is string => Boolean(t));
    return lines.slice(-MAX_TRANSCRIPT_LINES).join('\n');
  }, [captionsData]);

  const chatContext = useMemo(() => {
    const msgs = (chatData?.chat_message_public ?? [])
      .filter((m) => m.message?.trim())
      .slice(-MAX_CHAT_MESSAGES)
      .map((m) => `${m.senderName}: ${m.message}`);
    return msgs.join('\n');
  }, [chatData]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [turns]);

  const handleSend = async (): Promise<void> => {
    const trimmed = question.trim();
    if (!trimmed || sending) return;

    const turnId = `${Date.now()}`;
    setTurns((prev) => [
      ...prev,
      {
        id: turnId, question: trimmed, answer: '', status: 'pending',
      },
    ]);
    setQuestion('');
    setSending(true);

    try {
      const answer = await askChatbot(baseUrl, {
        meetingId,
        question: trimmed,
        language,
        context: {
          transcript: transcriptContext,
          chat: chatContext,
          slideText,
        },
      });
      setTurns((prev) => prev.map(
        (t) => (t.id === turnId ? { ...t, answer, status: 'done' } : t),
      ));
    } catch (error) {
      pluginLogger.error('Chatbot request failed', error);
      setTurns((prev) => prev.map(
        (t) => (t.id === turnId
          ? {
            ...t,
            status: 'error',
            error: 'The assistant is unreachable. Check the chatbot proxy URL in the plugin settings.',
          }
          : t),
      ));
    } finally {
      setSending(false);
    }
  };

  const handleSaveMaterials = async (): Promise<void> => {
    if (savingMaterials) return;
    setSavingMaterials(true);
    setMaterialsStatus(null);
    try {
      await uploadMaterials(baseUrl, meetingId, materialsText);
      setMaterialsStatus({ kind: 'ok', message: 'Materials saved for this meeting.' });
    } catch (error) {
      pluginLogger.error('Saving chatbot materials failed', error);
      setMaterialsStatus({ kind: 'err', message: 'Could not save materials. Check the proxy URL.' });
    } finally {
      setSavingMaterials(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const sendDisabled = sending || !question.trim();

  return (
    <div style={styles.wrapper}>
      <div style={styles.header}>
        <span style={styles.title}>{`Ask the ${assistantName}`}</span>
        <span style={styles.meta}>
          Answers use the live transcript, public chat and slides as context —
          without interrupting the teacher.
        </span>
      </div>

      <div style={styles.list} ref={listRef} data-test="chatbotConversation">
        {turns.length === 0 ? (
          <div style={styles.empty}>
            Ask a question about the lesson. The assistant answers privately,
            so you don&apos;t have to interrupt the speaker.
          </div>
        ) : (
          turns.map((turn) => (
            <div style={styles.turn} key={turn.id}>
              <div style={styles.question}>{turn.question}</div>
              {turn.status === 'pending' && (
                <div style={styles.answerPending}>{`${assistantName} is thinking…`}</div>
              )}
              {turn.status === 'done' && (
                <div style={styles.answer} data-test="chatbotAnswer">{turn.answer}</div>
              )}
              {turn.status === 'error' && (
                <div style={styles.answerError}>{turn.error}</div>
              )}
            </div>
          ))
        )}
      </div>

      <div style={styles.composer}>
        <textarea
          style={styles.textarea}
          rows={2}
          placeholder="Ask a question about the lesson…"
          value={question}
          data-test="chatbotQuestionInput"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div style={styles.row}>
          <span style={styles.meta}>Enter to send · Shift+Enter for a new line</span>
          <button
            type="button"
            data-test="chatbotSendButton"
            style={{ ...styles.button, ...(sendDisabled ? styles.buttonDisabled : {}) }}
            disabled={sendDisabled}
            onClick={handleSend}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>

      {isPresenter && (
        <div style={styles.teacherBox}>
          <span style={styles.teacherLabel}>Teacher: reference materials</span>
          <span style={styles.teacherHint}>
            Paste notes/outline the assistant should rely on for this meeting.
          </span>
          <textarea
            style={styles.textarea}
            rows={3}
            placeholder="e.g. Today's topic: photosynthesis. Key terms: chlorophyll, stomata…"
            value={materialsText}
            data-test="chatbotMaterialsInput"
            onChange={(e) => setMaterialsText(e.target.value)}
          />
          <div style={styles.row}>
            {materialsStatus ? (
              <span style={materialsStatus.kind === 'ok' ? styles.statusOk : styles.statusErr}>
                {materialsStatus.message}
              </span>
            ) : <span />}
            <button
              type="button"
              data-test="chatbotSaveMaterialsButton"
              style={{ ...styles.button, ...(savingMaterials ? styles.buttonDisabled : {}) }}
              disabled={savingMaterials}
              onClick={handleSaveMaterials}
            >
              {savingMaterials ? 'Saving…' : 'Save materials'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatbotPanel;
