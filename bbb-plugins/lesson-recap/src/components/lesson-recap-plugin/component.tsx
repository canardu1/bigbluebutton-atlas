import * as React from 'react';
import { useEffect } from 'react';
import * as ReactDOM from 'react-dom/client';
import {
  BbbPluginSdk,
  PluginApi,
  GenericContentSidekickArea,
  NavBarButton,
  NavBarItemPosition,
} from 'bigbluebutton-html-plugin-sdk';
import { RecapPanel } from '../recap-panel/component';
import { LessonRecapPluginProps } from './types';

const SIDEKICK_ID = 'lesson-recap-sidekick';

function RecapIcon(): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      width="20"
      height="20"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Zm-1.5 12 2.25 2.25 4.5-4.5"
      />
    </svg>
  );
}

function LessonRecapPlugin(
  { pluginUuid: uuid }: LessonRecapPluginProps,
): React.ReactElement | null {
  BbbPluginSdk.initialize(uuid);
  const pluginApi: PluginApi = BbbPluginSdk.getPluginApi(uuid);

  useEffect(() => {
    pluginApi.setGenericContentItems([
      new GenericContentSidekickArea({
        id: SIDEKICK_ID,
        name: 'Lesson recap',
        section: 'Assistant',
        buttonIcon: { svgContent: <RecapIcon /> },
        open: false,
        dataTest: 'lessonRecapSidekick',
        contentFunction: (element: HTMLElement) => {
          const root = ReactDOM.createRoot(element);
          root.render(<RecapPanel uuid={uuid} />);
          return root;
        },
      }),
    ]);
  }, []);

  useEffect(() => {
    pluginApi.setNavBarItems([
      new NavBarButton({
        label: 'Lesson recap',
        tooltip: 'Generate a summary, action items and flashcards from the lesson',
        icon: 'copy',
        position: NavBarItemPosition.RIGHT,
        hasSeparator: true,
        disabled: false,
        dataTest: 'openLessonRecapButton',
        onClick: () => {
          pluginApi.uiCommands.sidekickArea.options.panel.open();
        },
      }),
    ]);
  }, []);

  return null;
}

export default LessonRecapPlugin;
