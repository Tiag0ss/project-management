'use client';

import React, { forwardRef, useState } from 'react';

export type PasswordInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue'
> & {
  autoComplete?: string;
  /** Blocks browser autofill on load (read-only until focus). */
  preventAutofill?: boolean;
};

const defaultInputClass =
  'w-full rounded-md border border-[var(--pm-border)] bg-[var(--pm-surface)] px-3 py-1.5 text-sm text-[var(--pm-text)] outline-none placeholder:text-[var(--pm-muted)] focus:border-[var(--pm-accent)]';

/** Uncontrolled password field — secret is not kept in React state (not visible in React DevTools). */
const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  {
    autoComplete = 'current-password',
    preventAutofill = false,
    className,
    onFocus,
    readOnly,
    name,
    id,
    ...rest
  },
  ref
) {
  const [editable, setEditable] = useState(!preventAutofill);

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    if (preventAutofill && !editable) {
      setEditable(true);
    }
    onFocus?.(event);
  };

  return (
    <input
      {...rest}
      ref={ref}
      id={id}
      name={name}
      type="password"
      autoComplete={autoComplete}
      autoCorrect="off"
      spellCheck={false}
      data-lpignore="true"
      data-1p-ignore="true"
      readOnly={preventAutofill ? !editable || !!readOnly : readOnly}
      onFocus={handleFocus}
      className={className ?? defaultInputClass}
    />
  );
});

export default PasswordInput;

export function readPasswordInput(ref: React.RefObject<HTMLInputElement | null>): string {
  return ref.current?.value ?? '';
}

export function clearPasswordInput(ref: React.RefObject<HTMLInputElement | null>): void {
  if (ref.current) {
    ref.current.value = '';
  }
}
