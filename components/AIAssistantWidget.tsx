'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getApiUrl } from '@/lib/api/config';

type AssistantMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const ASSISTANT_BUBBLE_SIZE = 56;
const ASSISTANT_PANEL_WIDTH = 360;
const ASSISTANT_PANEL_HEIGHT = 460;
const ASSISTANT_VIEWPORT_MARGIN = 8;

export default function AIAssistantWidget() {
  const { user, token } = useAuth();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisibilityLoading, setIsVisibilityLoading] = useState(true);
  const [isGloballyAvailable, setIsGloballyAvailable] = useState(false);
  const [bubblePosition, setBubblePosition] = useState({ x: 0, y: 0 });
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      role: 'assistant',
      content: 'Hi! I can answer analytics questions from your allowed data (projects, tasks, time entries).',
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const bubbleDragStateRef = useRef<{
    isDragging: boolean;
    pointerOffsetX: number;
    pointerOffsetY: number;
    moved: boolean;
  }>({
    isDragging: false,
    pointerOffsetX: 0,
    pointerOffsetY: 0,
    moved: false,
  });
  const suppressBubbleClickRef = useRef(false);

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

  const expandedPanelPosition = useMemo(() => {
    if (typeof window === 'undefined') {
      return { left: ASSISTANT_VIEWPORT_MARGIN, top: ASSISTANT_VIEWPORT_MARGIN };
    }

    const preferredLeft = bubblePosition.x + ASSISTANT_BUBBLE_SIZE - ASSISTANT_PANEL_WIDTH;
    const preferredTop = bubblePosition.y + ASSISTANT_BUBBLE_SIZE - ASSISTANT_PANEL_HEIGHT;
    const maxLeft = Math.max(ASSISTANT_VIEWPORT_MARGIN, window.innerWidth - ASSISTANT_PANEL_WIDTH - ASSISTANT_VIEWPORT_MARGIN);
    const maxTop = Math.max(ASSISTANT_VIEWPORT_MARGIN, window.innerHeight - ASSISTANT_PANEL_HEIGHT - ASSISTANT_VIEWPORT_MARGIN);

    return {
      left: Math.min(Math.max(ASSISTANT_VIEWPORT_MARGIN, preferredLeft), maxLeft),
      top: Math.min(Math.max(ASSISTANT_VIEWPORT_MARGIN, preferredTop), maxTop),
    };
  }, [bubblePosition]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ai-assistant:minimized');
      if (stored === '1') {
        setIsMinimized(true);
      }

      const storedPosition = localStorage.getItem('ai-assistant:bubble-position');
      if (storedPosition) {
        const parsed = JSON.parse(storedPosition);
        const x = Number(parsed?.x);
        const y = Number(parsed?.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          setBubblePosition({ x, y });
          return;
        }
      }
    } catch {
      // Ignore localStorage read errors
    }

    if (typeof window !== 'undefined') {
      setBubblePosition({ x: window.innerWidth - 72, y: window.innerHeight - 72 });
    }
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: MouseEvent | PointerEvent) => {
      const dragState = bubbleDragStateRef.current;
      if (!dragState.isDragging) return;

      const nextX = Math.min(
        Math.max(8, event.clientX - dragState.pointerOffsetX),
        Math.max(8, window.innerWidth - ASSISTANT_BUBBLE_SIZE - ASSISTANT_VIEWPORT_MARGIN)
      );
      const nextY = Math.min(
        Math.max(8, event.clientY - dragState.pointerOffsetY),
        Math.max(8, window.innerHeight - ASSISTANT_BUBBLE_SIZE - ASSISTANT_VIEWPORT_MARGIN)
      );

      dragState.moved = true;
      setBubblePosition({ x: nextX, y: nextY });
    };

    const handlePointerUp = () => {
      const dragState = bubbleDragStateRef.current;
      if (!dragState.isDragging) return;

      dragState.isDragging = false;
      if (dragState.moved) {
        suppressBubbleClickRef.current = true;
        window.setTimeout(() => {
          suppressBubbleClickRef.current = false;
        }, 0);
        try {
          localStorage.setItem('ai-assistant:bubble-position', JSON.stringify(bubblePosition));
        } catch {
          // Ignore localStorage write errors
        }
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [bubblePosition]);

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

  const handleBubblePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    bubbleDragStateRef.current = {
      isDragging: true,
      pointerOffsetX: event.clientX - rect.left,
      pointerOffsetY: event.clientY - rect.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleBubbleClick = () => {
    if (suppressBubbleClickRef.current) {
      return;
    }
    setMinimized(false);
  };

  if (isVisibilityLoading || !isGloballyAvailable) {
    return null;
  }

  if (isMinimized) {
    return (
      <button
        type="button"
        onClick={handleBubbleClick}
        onPointerDown={handleBubblePointerDown}
        className="fixed z-[130] w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-2xl border border-blue-500 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
        title="Open AI Assistant"
        aria-label="Open AI Assistant"
        style={{ left: `${bubblePosition.x}px`, top: `${bubblePosition.y}px` }}
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
    <div
      className="fixed z-[130] w-[360px] max-w-[calc(100vw-1rem)] h-[460px] max-h-[calc(100vh-1rem)] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      style={{ left: `${expandedPanelPosition.left}px`, top: `${expandedPanelPosition.top}px` }}
    >
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
