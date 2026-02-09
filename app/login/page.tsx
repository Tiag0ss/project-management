'use client';

import { getApiUrl } from '@/lib/api/config';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [allowPublicRegistration, setAllowPublicRegistration] = useState(false);
  const [registrationType, setRegistrationType] = useState<'internal' | 'customer'>('internal');
  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    checkInstallStatus();
    checkRegistrationSettings();
  }, []);

  const checkInstallStatus = async () => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/install/check`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.needsInstall) {
          router.replace('/install');
          return;
        }
      }
    } catch (err) {
      console.error('Failed to check install status:', err);
    }
  };

  const checkRegistrationSettings = async () => {
    try {
      const response = await fetch(
        `${getApiUrl()}/api/system-settings/public`
      );
      
      if (response.ok) {
        const data = await response.json();
        setAllowPublicRegistration(data.allowPublicRegistration === true);
        setRegistrationType(data.publicRegistrationType || 'internal');
      }
    } catch (err) {
      console.error('Failed to load registration settings:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login({ username, password });
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-center mb-8 text-gray-900 dark:text-white">
            Login
          </h1>

          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-800 text-red-700 dark:text-red-400 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Username or Email
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter your username or email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                placeholder="Enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          {allowPublicRegistration && (
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {registrationType === 'customer' ? 'Need customer access?' : "Don't have an account?"}{' '}
                <Link href="/register" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                  {registrationType === 'customer' ? 'Register as customer' : 'Create account'}
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
