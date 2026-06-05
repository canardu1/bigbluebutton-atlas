/**
 * Thin client for the contextual-chatbot proxy backend. The proxy is what holds
 * the DeepSeek API key — it is never exposed to the browser. This module only
 * sends the student's question plus the lesson context gathered client-side
 * (transcription, public chat, current slide text) and renders the answer.
 */

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export interface ChatContext {
  /** Recent transcription lines, newest last, already joined into text. */
  transcript?: string;
  /** Recent public chat messages, already joined into text. */
  chat?: string;
  /** Text of the slide currently shown by the presenter, if any. */
  slideText?: string;
  /** Free-form reference materials uploaded by the teacher for this meeting. */
  materials?: string;
}

export interface AskChatbotRequest {
  meetingId: string;
  question: string;
  /** Language code the answer should be written in (e.g. "it", "en"). */
  language?: string;
  context: ChatContext;
}

interface ChatResponse {
  answer: string;
}

export async function askChatbot(
  baseUrl: string,
  payload: AskChatbotRequest,
): Promise<string> {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Chatbot proxy responded ${response.status}: ${detail}`);
  }

  const data = (await response.json()) as ChatResponse;
  return data.answer;
}

/**
 * Store/replace the teacher-provided reference materials for a meeting on the
 * proxy, so they become part of the context for everyone's questions.
 */
export async function uploadMaterials(
  baseUrl: string,
  meetingId: string,
  text: string,
): Promise<void> {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}/materials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meetingId, text }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Chatbot proxy responded ${response.status}: ${detail}`);
  }
}

/**
 * Fetch the extracted text of a presentation slide. BigBlueButton exposes a
 * per-page text URL (`currentPage.urlsJson.text`); this is the teacher's
 * uploaded material in machine-readable form.
 */
export async function fetchSlideText(textUrl: string): Promise<string> {
  const response = await fetch(textUrl);
  if (!response.ok) return '';
  return (await response.text()).trim();
}
