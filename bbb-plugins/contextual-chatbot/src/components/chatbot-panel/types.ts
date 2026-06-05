export interface ChatbotPanelProps {
  uuid: string;
}

export interface PluginSettings {
  /** Base URL of the chatbot proxy backend (which holds the DeepSeek key). */
  chatbotProxyUrl?: string;
  /** Display name for the assistant in the UI. */
  assistantName?: string;
}

export interface QaTurn {
  id: string;
  question: string;
  answer: string;
  status: 'pending' | 'done' | 'error';
  error?: string;
}
