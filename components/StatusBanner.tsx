import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon } from '@/components/Icons';

interface StatusBannerProps {
  tone: 'success' | 'error' | 'info';
  children: ReactNode;
}

export function StatusBanner({ tone, children }: StatusBannerProps) {
  return (
    <div className={`status-banner status-banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'error' ? <AlertIcon /> : tone === 'success' ? <CheckIcon /> : null}
      <span>{children}</span>
    </div>
  );
}
