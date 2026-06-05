export interface CaptionUser {
  name: string;
  color: string;
  isModerator: boolean;
}

export interface CaptionRow {
  captionId: string;
  captionText: string;
  locale: string;
  createdAt: string;
  user: CaptionUser | null;
}

export interface LiveCaptionsResponse {
  caption: CaptionRow[];
}

export interface ActiveLocale {
  locale: string;
}

export interface ActiveLocalesResponse {
  caption_activeLocales: ActiveLocale[];
}

/**
 * Live captions produced by BigBlueButton's built-in transcription. The
 * `caption` GraphQL view only exposes the last few seconds, which is exactly
 * the rolling window we want to translate and display.
 */
export const LIVE_CAPTIONS_SUBSCRIPTION = `
  subscription PluginLiveCaptions {
    caption(order_by: { createdAt: asc }) {
      captionId
      captionText
      locale
      createdAt
      user {
        name
        color
        isModerator
      }
    }
  }
`;

/**
 * Source locales for which a transcription is currently active in the meeting.
 */
export const ACTIVE_LOCALES_SUBSCRIPTION = `
  subscription PluginActiveCaptionLocales {
    caption_activeLocales {
      locale
    }
  }
`;
