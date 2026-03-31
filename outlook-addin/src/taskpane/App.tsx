import React, { useState, useEffect } from 'react';
import { storage } from '../utils/storage';
import Settings from './components/Settings';
import CreateTask from './components/CreateTask';

type View = 'create' | 'settings';

interface EmailContext {
  subject: string;
  senderEmail: string;
  senderName: string;
  bodyPreview: string;
  receivedDate: string;
}

function readEmailContext(): Promise<EmailContext> {
  return new Promise((resolve) => {
    const item = Office.context.mailbox.item;
    if (!item) {
      resolve({ subject: '', senderEmail: '', senderName: '', bodyPreview: '', receivedDate: '' });
      return;
    }

    const subject = item.subject || '';
    const senderEmail = (item as any).from?.emailAddress || '';
    const senderName = (item as any).from?.displayName || '';
    const receivedDate = (item as any).dateTimeCreated
      ? new Date((item as any).dateTimeCreated).toLocaleString()
      : '';

    // Get body preview (first 500 chars of plain text)
    if (item.body) {
      item.body.getAsync('text', { asyncContext: null }, (result: any) => {
        const bodyPreview =
          result.status === Office.AsyncResultStatus.Succeeded
            ? (result.value || '').substring(0, 500).trim()
            : '';
        resolve({ subject, senderEmail, senderName, bodyPreview, receivedDate });
      });
    } else {
      resolve({ subject, senderEmail, senderName, bodyPreview: '', receivedDate });
    }
  });
}

export default function App() {
  const [view, setView] = useState<View>('create');
  const [isConfigured, setIsConfigured] = useState(storage.isConfigured());
  const [emailContext, setEmailContext] = useState<EmailContext | null>(null);
  const [taskCreated, setTaskCreated] = useState<string | null>(null);
  const [officeReady, setOfficeReady] = useState(false);

  useEffect(() => {
    // Office.js is already initialized by index.tsx before rendering this App
    setOfficeReady(true);
    readEmailContext().then(ctx => setEmailContext(ctx));
  }, []);

  const handleSettingsSaved = () => {
    setIsConfigured(storage.isConfigured());
    setView('create');
  };

  const handleTaskCreated = (taskName: string) => {
    setTaskCreated(taskName);
  };

  const handleCreateAnother = () => {
    setTaskCreated(null);
  };

  return (
    <div className="pane-root">
      {/* Header */}
      <div className="header">
        <h1>
          {view === 'settings' ? '⚙ Settings' : '✚ Create Task'}
        </h1>
        <div className="header-actions">
          {view !== 'create' && (
            <button
              className="icon-btn"
              title="Create Task"
              onClick={() => { setView('create'); setTaskCreated(null); }}
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
          <button
            className={`icon-btn${view === 'settings' ? ' active' : ''}`}
            title="Settings"
            onClick={() => setView('settings')}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="pane-content">
        {view === 'settings' ? (
          <Settings onSaved={handleSettingsSaved} />
        ) : taskCreated ? (
          /* Success state */
          <div className="success-state">
            <div className="checkmark">✓</div>
            <h2>Task Created!</h2>
            <p><strong>"{taskCreated}"</strong> was added successfully.</p>
            <button className="btn btn-primary" onClick={handleCreateAnother}>
              Create Another Task
            </button>
          </div>
        ) : !isConfigured ? (
          /* Not configured yet */
          <div className="not-configured">
            <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
            </svg>
            <p>Configure the connection to your Project Management instance to get started.</p>
            <button className="btn btn-primary" onClick={() => setView('settings')}>
              Open Settings
            </button>
          </div>
        ) : !officeReady ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div className="spinner spinner-dark" style={{ margin: '0 auto 8px' }} />
            <p style={{ fontSize: 13, color: '#6b7280' }}>Initializing...</p>
          </div>
        ) : (
          <CreateTask
            emailContext={emailContext}
            onTaskCreated={handleTaskCreated}
          />
        )}
      </div>
    </div>
  );
}
