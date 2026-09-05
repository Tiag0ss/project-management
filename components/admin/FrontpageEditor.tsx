'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api/config';
import { useToast } from '@/contexts/ToastContext';

export default function FrontpageEditor() {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      if (!token) {
        setError('Authentication required');
        setIsLoading(false);
        return;
      }

      try {
        const publicResponse = await fetch(`${getApiUrl()}/api/system-settings/public`);
        if (publicResponse.ok) {
          const publicData = await publicResponse.json();
          const demoMode = publicData?.demoMode === true;
          setIsDemoMode(demoMode);

          if (demoMode) {
            setError('Demo mode is enabled. Frontpage loading and editing are disabled.');
            setIsLoading(false);
            return;
          }
        } else {
          setIsDemoMode(false);
        }
      } catch {
        setIsDemoMode(false);
      }

      await loadFrontpageContent();
    };

    void initialize();
  }, [token]);

  const loadFrontpageContent = async () => {
    if (!token) {
      setError('Authentication required');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${getApiUrl()}/api/system-settings/frontpage`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to load frontpage content');
      }

      const data = await response.json();
      const frontpageContent = data.content || getDefaultContent();
      setContent(frontpageContent);
      setOriginalContent(frontpageContent);
    } catch (err: any) {
      console.error('Error loading frontpage:', err);
      setError(err.message || 'An error occurred while loading frontpage');
    } finally {
      setIsLoading(false);
    }
  };

  const getDefaultContent = () => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Management</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            pm: {
              bg: '#0a0e13',
              glow: '#12202e',
              panel: '#111820',
              surface: '#0e141c',
              surface2: '#1a2430',
              border: '#243041',
              text: '#e8eef6',
              muted: '#8b98a8',
              accent: '#14b8a6',
              accentFg: '#042f2e',
              accentSoft: '#5eead4'
            }
          }
        }
      }
    }
  </script>
</head>
<body class="bg-pm-bg text-pm-text">
  <div class="min-h-screen">
    <nav class="sticky top-0 z-50 border-b border-pm-border bg-pm-bg/90 backdrop-blur-sm">
      <div class="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div class="flex items-center gap-2">
          <div class="flex h-8 w-8 items-center justify-center rounded-md bg-pm-accent text-sm font-bold text-pm-accentFg">P</div>
          <span class="text-base font-semibold">Project Management</span>
        </div>
        <div class="flex items-center gap-2">
          <a href="/login" class="rounded-lg px-3 py-1.5 text-sm text-pm-muted hover:text-pm-text">Login</a>
          <a href="/register" class="rounded-lg bg-pm-accent px-3 py-1.5 text-sm font-medium text-pm-accentFg hover:brightness-110">Get Started</a>
        </div>
      </div>
    </nav>

    <section class="relative overflow-hidden">
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_20%_-10%,rgba(18,32,46,0.75),transparent_60%)]"></div>
      <div class="relative mx-auto w-full max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-20">
        <p class="mb-3 text-xs font-medium uppercase tracking-wide text-pm-accentSoft">Self-hosted · Open source · Full control</p>
        <h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">Project Management</h1>
        <p class="mt-2 text-xl text-pm-muted sm:text-2xl">Your projects, your infrastructure.</p>
        <p class="mt-4 max-w-2xl text-sm leading-relaxed text-pm-muted sm:text-base">
          A self-hosted project management platform. Deploy on your own servers, keep full control over your data, and tailor workflows to your team.
        </p>
        <div class="mt-8 flex flex-wrap gap-2">
          <a href="/login" class="inline-flex h-10 items-center rounded-lg bg-pm-accent px-4 text-sm font-medium text-pm-accentFg hover:brightness-110">Access Dashboard</a>
          <a href="/register" class="inline-flex h-10 items-center rounded-lg border border-pm-border bg-pm-panel px-4 text-sm font-medium hover:bg-pm-surface2">Get Started</a>
        </div>
      </div>
    </section>

    <section class="border-t border-pm-border bg-pm-surface py-14">
      <div class="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <h2 class="text-2xl font-semibold">Built for self-hosting</h2>
        <p class="mt-2 max-w-2xl text-sm text-pm-muted">Deploy on your infrastructure and keep complete control over project data.</p>
        <div class="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <div class="rounded-md border border-pm-border bg-pm-panel p-4">
            <h3 class="text-sm font-semibold">Full Data Ownership</h3>
            <p class="mt-1.5 text-xs leading-relaxed text-pm-muted">Your data stays on your servers. No third-party access, complete privacy and control.</p>
          </div>
          <div class="rounded-md border border-pm-border bg-pm-panel p-4">
            <h3 class="text-sm font-semibold">Enterprise Security</h3>
            <p class="mt-1.5 text-xs leading-relaxed text-pm-muted">JWT authentication, role-based permissions, and encrypted data storage.</p>
          </div>
          <div class="rounded-md border border-pm-border bg-pm-panel p-4">
            <h3 class="text-sm font-semibold">Fully Customizable</h3>
            <p class="mt-1.5 text-xs leading-relaxed text-pm-muted">Custom statuses, workflows, and permissions tailored to your organization.</p>
          </div>
          <div class="rounded-md border border-pm-border bg-pm-panel p-4">
            <h3 class="text-sm font-semibold">Advanced Planning</h3>
            <p class="mt-1.5 text-xs leading-relaxed text-pm-muted">Gantt charts, resource allocation, and capacity planning tools.</p>
          </div>
          <div class="rounded-md border border-pm-border bg-pm-panel p-4">
            <h3 class="text-sm font-semibold">Time Tracking</h3>
            <p class="mt-1.5 text-xs leading-relaxed text-pm-muted">Comprehensive time tracking with daily and weekly timesheets.</p>
          </div>
          <div class="rounded-md border border-pm-border bg-pm-panel p-4">
            <h3 class="text-sm font-semibold">Multi-Tenant Support</h3>
            <p class="mt-1.5 text-xs leading-relaxed text-pm-muted">Manage multiple organizations with isolated data and custom permissions.</p>
          </div>
        </div>
      </div>
    </section>

    <footer class="border-t border-pm-border py-10">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:justify-between sm:px-6">
        <div>
          <div class="mb-2 flex items-center gap-2">
            <div class="flex h-7 w-7 items-center justify-center rounded-md bg-pm-accent text-xs font-bold text-pm-accentFg">P</div>
            <span class="text-sm font-semibold">Project Management</span>
          </div>
          <p class="text-xs text-pm-muted">Self-hosted project management platform</p>
        </div>
        <div>
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-pm-muted">Getting started</p>
          <a href="/login" class="text-sm text-pm-accentSoft hover:underline">Access your instance</a>
        </div>
      </div>
      <div class="mx-auto mt-8 w-full max-w-6xl border-t border-pm-border px-4 pt-6 text-center text-xs text-pm-muted sm:px-6">
        &copy; 2026 Project Management. Self-hosted solution.
      </div>
    </footer>
  </div>
</body>
</html>`;
  };

  const handleSave = async () => {
    if (isDemoMode) {
      setError('Demo mode is enabled. Frontpage editing is disabled.');
      return;
    }
    if (!token) {
      setError('Authentication required');
      return;
    }
    
    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(`${getApiUrl()}/api/system-settings/frontpage`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to save frontpage content');
      }

      setOriginalContent(content);
      setSuccessMessage('Frontpage saved successfully!');
      showToast({ type: 'success', title: 'Frontpage Saved', message: 'Frontpage saved successfully!' });
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      console.error('Error saving frontpage:', err);
      setError(err.message || 'An error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setContent(originalContent);
    setError('');
    setSuccessMessage('');
  };

  const handleResetToDefault = () => {
    setContent(getDefaultContent());
    setError('');
    setSuccessMessage('');
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-600 dark:text-gray-400">Loading frontpage content...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <p className="mb-4 text-xs text-[var(--pm-muted)]">
        Edit the HTML content of your frontpage. Changes are reflected in the preview on the right.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      {/* Editor and Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Editor */}
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            HTML Editor
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isDemoMode}
            className="w-full h-[600px] px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
            placeholder="Enter HTML content..."
            spellCheck={false}
          />
        </div>

        {/* Live Preview */}
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Live Preview
          </label>
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-900 h-[600px]">
            <iframe
              srcDoc={content}
              className="w-full h-full"
              title="Frontpage Preview"
              sandbox="allow-same-origin allow-scripts"
            />
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">Tips</h3>
        <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
          <li>• Use Tailwind CSS classes for styling</li>
          <li>• Dark mode classes (dark:) are supported</li>
          <li>• Changes are saved to the database and will persist across restarts</li>
          <li>• The preview updates in real-time as you type</li>
          <li>• Use &quot;Reset to Default&quot; to restore the original template</li>
        </ul>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 flex flex-wrap justify-end gap-2 border-t border-[var(--pm-border)] bg-[var(--pm-panel)] px-4 py-3 sm:-mx-6 sm:px-6">
        <button
          type="button"
          onClick={handleResetToDefault}
          disabled={isDemoMode}
          className="h-10 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white transition-colors hover:bg-orange-700 disabled:bg-gray-400"
        >
          Reset to Default
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={isDemoMode || content === originalContent}
          className="h-10 rounded-lg border border-[var(--pm-border)] bg-[var(--pm-surface)] px-4 text-sm font-medium text-[var(--pm-text)] transition-colors hover:bg-[var(--pm-surface-2)] disabled:opacity-50"
        >
          Reset to Saved
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isDemoMode || isSaving || content === originalContent}
          className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-gray-400"
        >
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
