'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api/config';

export default function FrontpageEditor() {
  const { token } = useAuth();
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (token) {
      loadFrontpageContent();
    }
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
</head>
<body>
  <div class="min-h-screen bg-white dark:bg-gray-900">
    <!-- Navigation -->
    <nav class="border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
              <span class="text-white font-bold text-lg">PM</span>
            </div>
            <span class="text-xl font-bold text-gray-900 dark:text-white">Project Management</span>
          </div>
          <div class="flex gap-4">
            <a href="/login" class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors">
              Login
            </a>
            <a href="/register" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-md hover:shadow-lg">
              Get Started
            </a>
          </div>
        </div>
      </div>
    </nav>

    <!-- Hero Section -->
    <section class="relative overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-gray-800 dark:via-gray-900 dark:to-gray-900 opacity-50"></div>
      
      <div class="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-32">
        <div class="text-center">
          <div class="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-8">
            <svg class="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            <span class="text-sm font-medium text-blue-900 dark:text-blue-300">
              Self-Hosted • Open Source • Full Control
            </span>
          </div>
          
          <h1 class="text-5xl md:text-6xl lg:text-7xl font-extrabold text-gray-900 dark:text-white mb-6">
            Your Projects,
            <br />
            <span class="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Your Infrastructure
            </span>
          </h1>
          
          <p class="text-xl md:text-2xl text-gray-600 dark:text-gray-300 mb-12 max-w-3xl mx-auto">
            A powerful self-hosted project management platform. Deploy on your own servers, maintain complete control over your data, and customize everything to fit your workflow.
          </p>

          <div class="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <a href="/login" class="group px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center gap-2">
              Access Dashboard
              <svg class="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
            <a href="/register" class="px-8 py-4 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-semibold rounded-xl border-2 border-gray-300 dark:border-gray-600 transition-all shadow-md hover:shadow-lg">
              Get Started
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- Features Section -->
    <section class="py-20 bg-gray-50 dark:bg-gray-800/50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-16">
          <h2 class="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Built for Self-Hosting
          </h2>
          <p class="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Deploy on your infrastructure and maintain complete control over your project data
          </p>
        </div>

        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <!-- Feature 1 -->
          <div class="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100 dark:border-gray-700">
            <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-5">
              <svg class="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              Full Data Ownership
            </h3>
            <p class="text-gray-600 dark:text-gray-400">
              Your data stays on your servers. No third-party access, complete privacy and control
            </p>
          </div>

          <!-- Feature 2 -->
          <div class="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100 dark:border-gray-700">
            <div class="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center mb-5">
              <svg class="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              Enterprise Security
            </h3>
            <p class="text-gray-600 dark:text-gray-400">
              JWT authentication, role-based permissions, and encrypted data storage
            </p>
          </div>

          <!-- Feature 3 -->
          <div class="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100 dark:border-gray-700">
            <div class="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mb-5">
              <svg class="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-3">
              Fully Customizable
            </h3>
            <p class="text-gray-600 dark:text-gray-400">
              Custom statuses, workflows, and permissions tailored to your organization
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="bg-gray-900 text-gray-400 py-12">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid md:grid-cols-2 gap-8 mb-8">
          <div>
            <div class="flex items-center gap-2 mb-4">
              <div class="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <span class="text-white font-bold">PM</span>
              </div>
              <span class="text-white font-bold">Project Management</span>
            </div>
            <p class="text-sm mb-4">
              Self-hosted project management platform
            </p>
          </div>
        </div>
        <div class="border-t border-gray-800 pt-8 text-center">
          <p class="text-sm">
            &copy; 2026 Project Management. Self-hosted solution.
          </p>
        </div>
      </div>
    </footer>
  </div>
</body>
</html>`;
  };

  const handleSave = async () => {
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
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Frontpage Editor
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Edit the HTML content of your frontpage. Changes will be reflected in the preview on the right.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 text-red-700 dark:text-red-400 rounded">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 border border-green-400 text-green-700 dark:text-green-400 rounded">
          {successMessage}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving || content === originalContent}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          onClick={handleReset}
          disabled={content === originalContent}
          className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          Reset to Saved
        </button>
        <button
          onClick={handleResetToDefault}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors"
        >
          Reset to Default
        </button>
      </div>

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
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">💡 Tips:</h3>
        <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1">
          <li>• Use Tailwind CSS classes for styling</li>
          <li>• Dark mode classes (dark:) are supported</li>
          <li>• Changes are saved to the database and will persist across restarts</li>
          <li>• The preview updates in real-time as you type</li>
          <li>• Use "Reset to Default" to restore the original template</li>
        </ul>
      </div>
    </div>
  );
}
