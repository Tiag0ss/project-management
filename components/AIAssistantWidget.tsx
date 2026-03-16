'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api/config';

type AssistantMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export default function AIAssistantWidget() {
  const { user, token } = useAuth();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisibilityLoading, setIsVisibilityLoading] = useState(true);
  const [isGloballyAvailable, setIsGloballyAvailable] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      role: 'assistant',
      content: 'Hi! I can answer analytics questions from your allowed data (projects, tasks, time entries).',
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const canUseAssistant = Boolean(user && token);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    const nextMessages: AssistantMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      if (!token) {
        throw new Error('Please login to use the assistant.');
      }

      const response = await fetch(`${getApiUrl()}/api/ai-assistant/chat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: trimmed,
          history: nextMessages.slice(-8),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || 'Failed to get assistant response');
      }

      const answer = String(payload?.data?.answer || '').trim() || 'I could not generate a response right now.';
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }]);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: error?.message || 'Assistant is temporarily unavailable.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const placeholder = useMemo(() => {
    if (!canUseAssistant) return 'Login required to ask questions...';
    return 'Ask about projects, overdue tasks, capacity, hours...';
  }, [canUseAssistant]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ai-assistant:minimized');
      if (stored === '1') {
        setIsMinimized(true);
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, []);

  useEffect(() => {
    const loadAssistantAvailability = async () => {
      if (!token) {
        setIsGloballyAvailable(false);
        setIsVisibilityLoading(false);
        return;
      }

      try {
        const response = await fetch(`${getApiUrl()}/api/ai-assistant/availability`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          setIsGloballyAvailable(false);
          return;
        }
        const data = await response.json();
        setIsGloballyAvailable(data?.available === true);
      } catch {
        setIsGloballyAvailable(false);
      } finally {
        setIsVisibilityLoading(false);
      }
    };

    void loadAssistantAvailability();
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending]);

  const setMinimized = (value: boolean) => {
    setIsMinimized(value);
    try {
      localStorage.setItem('ai-assistant:minimized', value ? '1' : '0');
    } catch {
      // Ignore localStorage write errors
    }
  };

  if (isVisibilityLoading || !isGloballyAvailable) {
    return null;
  }

  if (isMinimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-[130] w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-2xl border border-blue-500 flex items-center justify-center"
        title="Open AI Assistant"
        aria-label="Open AI Assistant"
      >
        <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M8 10H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M8 14H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M7 4H17C18.6569 4 20 5.34315 20 7V14C20 15.6569 18.6569 17 17 17H13.5L9.5 20V17H7C5.34315 17 4 15.6569 4 14V7C4 5.34315 5.34315 4 7 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        </svg>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[130] w-[360px] max-w-[calc(100vw-1rem)] h-[460px] max-h-[calc(100vh-1rem)] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
      <div className="px-4 py-3 bg-blue-600 text-white text-sm font-semibold flex items-center justify-between">
        <span>AI Assistant</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] opacity-90">RAG MVP</span>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="w-7 h-7 inline-flex items-center justify-center rounded bg-blue-500 hover:bg-blue-400"
            title="Minimize assistant"
            aria-label="Minimize assistant"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M6 12H18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50 dark:bg-gray-900/40">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[92%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
              message.role === 'user'
                ? 'ml-auto bg-blue-600 text-white'
                : 'mr-auto bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700'
            }`}
          >
            {message.content}
          </div>
        ))}
        {isSending && (
          <div className="mr-auto bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm">
            Thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void sendMessage();
              }
            }}
            disabled={!canUseAssistant || isSending}
            placeholder={placeholder}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!canUseAssistant || isSending || !input.trim()}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
