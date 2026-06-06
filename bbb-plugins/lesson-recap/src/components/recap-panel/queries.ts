export interface CaptionRow {
  captionId: string;
  captionText: string;
  locale: string;
  createdAt: string;
}

export interface LiveCaptionsResponse {
  caption: CaptionRow[];
}

/**
 * Live captions produced by BigBlueButton's built-in transcription. The
 * `caption` view only exposes a rolling window of recent lines, so the recap
 * panel accumulates them client-side over the whole lesson (see component).
 */
export const LIVE_CAPTIONS_SUBSCRIPTION = `
  subscription PluginRecapCaptions {
    caption(order_by: { createdAt: asc }) {
      captionId
      captionText
      locale
      createdAt
    }
  }
`;
