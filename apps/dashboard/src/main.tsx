import React from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { App } from './ui/App';
import './ui/app.css';
import './ui/workflow.css';
import './ui/appearance.css';
import './ui/reports.css';
import { initializeTheme } from './ui/theme';

initializeTheme();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
