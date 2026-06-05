export interface CaptionRow {
  captionId: string;
  captionText: string;
  locale: string;
  createdAt: string;
}

export interface LiveCaptionsResponse {
  caption: CaptionRow[];
}

export interface ChatMessageRow {
  messageId: string;
  message: string;
  senderName: string;
  senderRole: string;
  createdAt: string;
}

export interface PublicChatResponse {
  chat_message_public: ChatMessageRow[];
}

/**
 * Live captions produced by BigBlueButton's built-in transcription. Used as the
 * spoken-context the assistant reasons over. The `caption` view exposes a
 * rolling window of recent lines, which is what we want for "what was just
 * said".
 */
export const LIVE_CAPTIONS_SUBSCRIPTION = `
  subscription PluginChatbotCaptions {
    caption(order_by: { createdAt: asc }) {
      captionId
      captionText
      locale
      createdAt
    }
  }
`;

/**
 * Public chat messages of the meeting, used as additional lesson context (e.g.
 * links or clarifications the teacher typed). Ordered chronologically.
 */
export const PUBLIC_CHAT_SUBSCRIPTION = `
  subscription PluginChatbotPublicChat {
    chat_message_public(order_by: { createdAt: asc }) {
      messageId
      message
      senderName
      senderRole
      createdAt
    }
  }
`;
