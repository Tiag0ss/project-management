'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useColorVision } from '@/hooks/useColorVision';

interface ColorCodedPillProps {
  color?: string | null;
  className?: string;
  children: ReactNode;
  alpha?: string;
  borderAlpha?: string;
  style?: CSSProperties;
}

export default function ColorCodedPill({
  color,
  className = '',
  children,
  alpha,
  borderAlpha,
  style,
}: ColorCodedPillProps) {
  const { pillStyle } = useColorVision();
  const mappedStyle = pillStyle(color, { alpha, borderAlpha });

  return (
    <span className={className} style={{ ...mappedStyle, ...style }}>
      {children}
    </span>
  );
}
