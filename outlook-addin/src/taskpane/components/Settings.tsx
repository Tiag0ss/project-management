import React, { useState, useEffect } from 'react';
import { storage } from '../../utils/storage';
import { testConnection } from '../../utils/api';

interface SettingsProps {
  onSaved: () => void;
}

export default function Settings({ onSaved }: SettingsProps) {
  const [endpoint, setEndpoint] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [connectedUser, setConnectedUser] = useState<string | null>(null);

  useEffect(() => {
    setEndpoint(storage.getEndpoint());
    setApiToken(storage.getApiToken());
    // Try to auto-detect connected user
    if (storage.isConfigured()) {
      testConnection()
        .then(u => setConnectedUser(`${u.username} (${u.email})`))
        .catch(() => setConnectedUser(null));
    }
  }, []);

  const handleSave = () => {
    if (!endpoint.trim() || !apiToken.trim()) {
      setMessage({ type: 'error', text: 'Both API endpoint and token are required.' });
      return;
    }
    setIsSaving(true);
    storage.setEndpoint(endpoint);
    storage.setApiToken(apiToken);
    setMessage({ type: 'success', text: 'Settings saved.' });
    setIsSaving(false);
    onSaved();
  };

  const handleTest = async () => {
    if (!endpoint.trim() || !apiToken.trim()) {
      setMessage({ type: 'error', text: 'Enter the endpoint and token first.' });
      return;
    }
    // Temporarily save to test
    storage.setEndpoint(endpoint);
    storage.setApiToken(apiToken);

    setIsTesting(true);
    setMessage(null);
    try {
      const user = await testConnection();
      setConnectedUser(`${user.username} (${user.email})`);
      setMessage({ type: 'success', text: `Connected as ${user.username}.` });
    } catch (err: any) {
      setConnectedUser(null);
      setMessage({ type: 'error', text: err.message || 'Connection failed. Check endpoint and token.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleClear = () => {
    storage.clear();
    setEndpoint('');
    setApiToken('');
    setConnectedUser(null);
    setMessage({ type: 'info', text: 'Settings cleared.' });
  };

  return (
    <div>
      <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
        Configure the connection to your Project Management instance.
        Generate an API token in <strong>Administration → API Tokens</strong>.
      </p>

      {connectedUser && (
        <div className="alert alert-success" style={{ marginBottom: 14 }}>
          <span className="connection-badge connected" style={{ marginRight: 6 }}>●</span>
          Connected as <strong>{connectedUser}</strong>
        </div>
      )}

      {message && (
        <div className={`alert alert-${message.type}`}>{message.text}</div>
      )}

      <div className="field">
        <label className="field-label">API Endpoint URL</label>
        <input
          type="url"
          value={endpoint}
          onChange={e => setEndpoint(e.target.value)}
          placeholder="https://your-server.example.com"
        />
        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
          Base URL of your Project Management server (no trailing slash).
        </p>
      </div>

      <div className="field">
        <label className="field-label">API Token</label>
        <div className="token-display">
          <input
            type={showToken ? 'text' : 'password'}
            value={apiToken}
            onChange={e => setApiToken(e.target.value)}
            placeholder="pt_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowToken(v => !v)}
            style={{ flexShrink: 0 }}
          >
            {showToken ? 'Hide' : 'Show'}
          </button>
        </div>
        <p style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
          Token starts with <code>pt_</code>. Generate it in the admin panel.
        </p>
      </div>

      <hr className="divider" />

      <div className="btn-row">
        <button
          className="btn btn-secondary"
          onClick={handleTest}
          disabled={isTesting}
        >
          {isTesting ? <span className="spinner spinner-dark" /> : null}
          {isTesting ? 'Testing...' : 'Test Connection'}
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? <span className="spinner" /> : null}
          Save Settings
        </button>
      </div>

      <hr className="divider" />

      <button className="btn btn-danger btn-sm" onClick={handleClear}>
        Clear Saved Settings
      </button>
    </div>
  );
}
