import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import ContextualChatbotPlugin from './components/contextual-chatbot-plugin/component';

const uuid = document.currentScript?.getAttribute('uuid') || 'root';
const pluginName = document.currentScript?.getAttribute('pluginName') || 'plugin';

const root = ReactDOM.createRoot(document.getElementById(uuid) as HTMLElement);
root.render(
  <ContextualChatbotPlugin
    {...{
      pluginUuid: uuid,
      pluginName,
    }}
  />,
);
