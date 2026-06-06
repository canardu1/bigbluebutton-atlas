export interface RecapPanelProps {
  uuid: string;
}

export interface PluginSettings {
  /** Base URL of the shared DeepSeek proxy backend (which holds the API key). */
  recapProxyUrl?: string;
  /** Backwards-compatible alias: the chatbot plugin uses the same proxy. */
  chatbotProxyUrl?: string;
}

export interface Flashcard {
  question: string;
  answer: string;
}

export interface RecapData {
  summary: string;
  actionItems: string[];
  flashcards: Flashcard[];
}
