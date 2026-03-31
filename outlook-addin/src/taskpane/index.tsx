import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

/* Office.js is loaded via the <script> tag in taskpane.html.
   We wait for Office.onReady before mounting React so that
   Office.context.mailbox is available. */
Office.onReady(() => {
  const container = document.getElementById('root');
  if (!container) return;
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
