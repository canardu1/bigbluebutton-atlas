import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { RecapPanel } from '../src/components/recap-panel/component';

const container = document.getElementById('root');
if (!container) throw new Error('demo root container missing');

createRoot(container).render(
  <div style={{ height: '100vh', width: '460px', borderRight: '1px solid #e2e8f0' }}>
    <RecapPanel uuid="demo-plugin" />
  </div>,
);
