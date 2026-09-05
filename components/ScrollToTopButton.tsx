'use client';

import { useEffect, useState, type CSSProperties, type RefObject } from 'react';

interface ScrollToTopButtonProps {
  /** Scroll container; defaults to the window. */
  scrollContainerRef?: RefObject<HTMLElement | null> | RefObject<HTMLDivElement | null>;
  /** Pixels scrolled before the button appears. */
  threshold?: number;
  /** Extra Tailwind classes for positioning overrides. */
  className?: string;
}

function getScrollTop(container: HTMLElement | Window): number {
  if (container instanceof Window) {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }
  return container.scrollTop;
}

function scrollElementToTop(container: HTMLElement | Window) {
  if (container instanceof Window) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  container.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Keep clear of PageStickyActions (+ default 1.5rem inset). */
function measureStickyActionsClearance(): number {
  const actions = document.querySelector<HTMLElement>('[data-page-sticky-actions]');
  if (!actions) return 24;
  const rect = actions.getBoundingClientRect();
  const fromViewportBottom = Math.max(0, window.innerHeight - rect.top);
  return fromViewportBottom + 12;
}

export default function ScrollToTopButton({
  scrollContainerRef,
  threshold = 320,
  className = '',
}: ScrollToTopButtonProps) {
  const [visible, setVisible] = useState(false);
  const [bottomPx, setBottomPx] = useState(24);

  useEffect(() => {
    let attached: HTMLElement | Window | null = null;

    const updateVisibility = () => {
      if (!attached) return;
      setVisible(getScrollTop(attached) > threshold);
    };

    const resolveContainer = (): HTMLElement | Window =>
      scrollContainerRef?.current ?? window;

    const attach = () => {
      const next = resolveContainer();
      if (attached === next) {
        updateVisibility();
        return;
      }
      if (attached) {
        attached.removeEventListener('scroll', updateVisibility);
      }
      attached = next;
      attached.addEventListener('scroll', updateVisibility, { passive: true });
      updateVisibility();
    };

    attach();
    // Ref may not be set on the first paint when the container is conditionally rendered.
    const rafId = window.requestAnimationFrame(attach);
    const retryId = window.setTimeout(attach, 0);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(retryId);
      if (attached) {
        attached.removeEventListener('scroll', updateVisibility);
      }
    };
  }, [scrollContainerRef, threshold]);

  useEffect(() => {
    let debounceId: number | null = null;
    let observed: HTMLElement | null = null;

    const updateClearance = () => {
      setBottomPx(measureStickyActionsClearance());
    };

    const observer = new ResizeObserver(updateClearance);

    const watchActions = () => {
      const actions = document.querySelector<HTMLElement>('[data-page-sticky-actions]');
      if (actions === observed) return;
      if (observed) observer.unobserve(observed);
      observed = actions;
      if (actions) observer.observe(actions);
    };

    const scheduleUpdate = () => {
      if (debounceId != null) window.clearTimeout(debounceId);
      debounceId = window.setTimeout(() => {
        watchActions();
        updateClearance();
      }, 50);
    };

    watchActions();
    updateClearance();
    window.addEventListener('resize', scheduleUpdate);

    const mutation = new MutationObserver(scheduleUpdate);
    mutation.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (debounceId != null) window.clearTimeout(debounceId);
      window.removeEventListener('resize', scheduleUpdate);
      observer.disconnect();
      mutation.disconnect();
    };
  }, []);

  if (!visible) {
    return null;
  }

  const style: CSSProperties = { bottom: bottomPx };

  return (
    <button
      type="button"
      onClick={() => scrollElementToTop(scrollContainerRef?.current ?? window)}
      style={style}
      className={`fixed right-6 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 ${className}`}
      title="Back to top"
      aria-label="Back to top"
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    </button>
  );
}
