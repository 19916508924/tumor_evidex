'use client';

import { useState } from 'react';
import { IconCheck, IconCopy, IconX } from '@tabler/icons-react';

export interface LandingCopyLabels {
  idle: string;
  success: string;
  error: string;
}

export function LandingApiCopy({
  text,
  labels,
}: {
  text: string;
  labels: LandingCopyLabels;
}) {
  const [state, setState] = useState<'idle' | 'success' | 'error'>('idle');
  const label = state === 'idle' ? labels.idle : labels[state];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('success');
    } catch {
      setState('error');
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-[#A9C4EA] bg-white px-4 text-sm font-semibold whitespace-nowrap text-[#0B3975] transition duration-200 hover:border-[#175CD3] hover:bg-[#F4F8FF] focus-visible:ring-2 focus-visible:ring-[#175CD3] focus-visible:ring-offset-2 focus-visible:outline-none active:translate-y-px"
      >
        {state === 'success' ? (
          <IconCheck aria-hidden size={17} stroke={1.8} />
        ) : state === 'error' ? (
          <IconX aria-hidden size={17} stroke={1.8} />
        ) : (
          <IconCopy aria-hidden size={17} stroke={1.8} />
        )}
        {label}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {state === 'idle' ? '' : label}
      </span>
    </div>
  );
}
