export interface RecapPanelProps {
  uuid: string;
}

export interface PluginSettings {
  /** Base URL of the shared DeepSeek proxy backend (which holds the API key). */
  recapProxyUrl?: string;
  /** Backwards-compatible alias: the chatbot plugin uses the same proxy. */
  chatbotProxyUrl?: string;
  /** Which output the panel starts with: "lesson" (default) or "meeting". */
  defaultRecapMode?: 'lesson' | 'meeting';
}

export interface Flashcard {
  question: string;
  answer: string;
}

export interface ActionItem {
  text: string;
  owner?: string;
  due?: string;
}

export interface RecapData {
  summary: string;
  decisions: string[];
  actionItems: ActionItem[];
  flashcards: Flashcard[];
}
