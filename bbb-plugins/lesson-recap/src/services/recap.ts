/**
 * Thin client for the shared DeepSeek proxy backend. The proxy is what holds
 * the DeepSeek API key — it is never exposed to the browser. This module sends
 * the accumulated transcript and slide text and renders the structured recap
 * returned by the proxy: study material in "lesson" mode, meeting minutes
 * (decisions + action items with owner and deadline) in "meeting" mode.
 */

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

export interface Flashcard {
  question: string;
  answer: string;
}

export type RecapMode = 'lesson' | 'meeting';

export interface ActionItem {
  text: string;
  /** Person who committed to the task, when the transcript names one. */
  owner?: string;
  /** Deadline as it was stated, e.g. "next Friday" or "2026-09-01". */
  due?: string;
}

export interface RecapData {
  summary: string;
  decisions: string[];
  actionItems: ActionItem[];
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
  mode: RecapMode;
}

interface RawRecapData {
  summary?: string;
  decisions?: string[];
  actionItems?: (string | ActionItem)[];
  flashcards?: Flashcard[];
}

const toActionItem = (item: string | ActionItem): ActionItem => (
  typeof item === 'string' ? { text: item } : item
);

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

  const data = (await response.json()) as RawRecapData;
  return {
    summary: data.summary ?? '',
    decisions: data.decisions ?? [],
    actionItems: (data.actionItems ?? []).map(toActionItem),
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
export function recapToMarkdown(
  recap: RecapData,
  title = 'Lesson recap',
  mode: RecapMode = 'lesson',
): string {
  const lines: string[] = [`# ${title}`, ''];

  lines.push('## Summary', '', recap.summary || '_No summary available._', '');

  if (mode === 'meeting') {
    lines.push('## Decisions', '');
    if (recap.decisions.length === 0) {
      lines.push('_No decisions were recorded._', '');
    } else {
      recap.decisions.forEach((decision) => lines.push(`- ${decision}`));
      lines.push('');
    }

    lines.push('## Action items', '');
    if (recap.actionItems.length === 0) {
      lines.push('_No action items._', '');
    } else {
      lines.push('| Task | Owner | Due |', '| --- | --- | --- |');
      recap.actionItems.forEach((item) => {
        lines.push(`| ${item.text} | ${item.owner || '—'} | ${item.due || '—'} |`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }

  lines.push('## Action items', '');
  if (recap.actionItems.length === 0) {
    lines.push('_No action items._', '');
  } else {
    recap.actionItems.forEach((item) => {
      const suffix = [item.owner, item.due].filter(Boolean).join(', ');
      lines.push(suffix ? `- ${item.text} (${suffix})` : `- ${item.text}`);
    });
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
