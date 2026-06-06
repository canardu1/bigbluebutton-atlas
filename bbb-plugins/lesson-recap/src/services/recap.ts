/**
 * Thin client for the shared DeepSeek proxy backend. The proxy is what holds
 * the DeepSeek API key — it is never exposed to the browser. This module sends
 * the accumulated lesson transcript and slide text and renders the structured
 * recap (summary, action items, flashcards) returned by the proxy.
 */

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export interface Flashcard {
  question: string;
  answer: string;
}

export interface RecapData {
  summary: string;
  actionItems: string[];
  flashcards: Flashcard[];
}

export interface GenerateRecapRequest {
  meetingId: string;
  /** Language code the recap should be written in (e.g. "it", "en"). */
  language?: string;
  /** Full accumulated transcript of the lesson. */
  transcript: string;
  /** Concatenated text of every slide shown during the lesson. */
  slides: string;
}

export async function generateRecap(
  baseUrl: string,
  payload: GenerateRecapRequest,
): Promise<RecapData> {
  const response = await fetch(`${trimTrailingSlash(baseUrl)}/recap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Recap proxy responded ${response.status}: ${detail}`);
  }

  const data = (await response.json()) as RecapData;
  return {
    summary: data.summary ?? '',
    actionItems: data.actionItems ?? [],
    flashcards: data.flashcards ?? [],
  };
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

/** Render a recap as Markdown for copy/download. */
export function recapToMarkdown(recap: RecapData, title = 'Lesson recap'): string {
  const lines: string[] = [`# ${title}`, ''];

  lines.push('## Summary', '', recap.summary || '_No summary available._', '');

  lines.push('## Action items', '');
  if (recap.actionItems.length === 0) {
    lines.push('_No action items._', '');
  } else {
    recap.actionItems.forEach((item) => lines.push(`- ${item}`));
    lines.push('');
  }

  lines.push('## Flashcards', '');
  if (recap.flashcards.length === 0) {
    lines.push('_No flashcards._', '');
  } else {
    recap.flashcards.forEach((card, index) => {
      lines.push(`${index + 1}. **Q:** ${card.question}`, `   **A:** ${card.answer}`, '');
    });
  }

  return lines.join('\n');
}
