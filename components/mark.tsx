'use client';

import { useId } from 'react';

/** The Abhed mark: an angular bolt with two notches. `ink` for light pages, `silver` for dark ones. */
export function AbhedMark({ size = 22, variant = 'silver' }: { size?: number; variant?: 'ink' | 'silver' }) {
  const id = useId().replace(/:/g, '');
  const silver = variant === 'silver';
  return (
    <svg width={(size * 31.5) / 48.5} height={size} viewBox="0 0 31.5 48.5" aria-hidden="true">
      <defs>
        <linearGradient id={`m${id}`} x1="8" y1="0" x2="34.1" y2="28.9" gradientUnits="userSpaceOnUse">
          {silver ? (
            <>
              <stop offset="0" stopColor="#9e9e9e" />
              <stop offset=".34" stopColor="#a3a3a3" />
              <stop offset=".4" stopColor="#3a3a3a" />
              <stop offset=".55" stopColor="#414141" />
              <stop offset=".68" stopColor="#8e8e8e" />
              <stop offset="1" stopColor="#cccccc" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#2b313c" />
              <stop offset=".4" stopColor="#0c0e12" />
              <stop offset="1" stopColor="#3b4250" />
            </>
          )}
        </linearGradient>
      </defs>
      <path d="M21.5 0 L21.5 19.5 L31.5 19.5 L31.5 29 L10 48.5 L10 28.5 L0.5 28.5 L0.5 18.5 Z" fill={`url(#m${id})`} />
      <rect x="0.5" y="18.5" width="9" height="10" fill={silver ? '#fdfdfd' : '#1e44d6'} />
      <rect x="22" y="19.5" width="9.5" height="9.5" fill={silver ? '#fdfdfd' : '#1e44d6'} />
    </svg>
  );
}
