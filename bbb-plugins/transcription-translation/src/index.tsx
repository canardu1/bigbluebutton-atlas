import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import TranscriptionTranslationPlugin from './components/transcription-translation-plugin/component';

const uuid = document.currentScript?.getAttribute('uuid') || 'root';
const pluginName = document.currentScript?.getAttribute('pluginName') || 'plugin';

const root = ReactDOM.createRoot(document.getElementById(uuid) as HTMLElement);
root.render(
  <TranscriptionTranslationPlugin
    {...{
      pluginUuid: uuid,
      pluginName,
    }}
  />,
);
