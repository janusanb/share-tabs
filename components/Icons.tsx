/**
 * Small inline SVGs so the extension never fetches an icon font/sprite
 * sheet over the network — everything renders from bundled markup.
 */
type IconProps = { className?: string };

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  'aria-hidden': true,
} as const;

export function CopyIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="5.5" y="5.5" width="8" height="8.5" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M3.5 10V3.2C3.5 2.65 3.95 2.2 4.5 2.2H10"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8 2v7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M4.5 7 8 10.5 11.5 7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 12.5h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function QrIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="2.3" y="2.3" width="4.4" height="4.4" rx="0.6" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9.3" y="2.3" width="4.4" height="4.4" rx="0.6" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.3" y="9.3" width="4.4" height="4.4" rx="0.6" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9.6" y="9.6" width="1.4" height="1.4" fill="currentColor" />
      <rect x="12.3" y="9.6" width="1.4" height="1.4" fill="currentColor" />
      <rect x="9.6" y="12.3" width="1.4" height="1.4" fill="currentColor" />
      <rect x="12.3" y="12.3" width="1.4" height="1.4" fill="currentColor" />
    </svg>
  );
}

export function CameraIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path
        d="M2.5 5.8c0-.66.54-1.2 1.2-1.2h1.2l.6-1.1a1 1 0 0 1 .88-.5h3.24a1 1 0 0 1 .88.5l.6 1.1h1.2c.66 0 1.2.54 1.2 1.2v5.9c0 .66-.54 1.2-1.2 1.2H3.7a1.2 1.2 0 0 1-1.2-1.2V5.8Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8.7" r="2.15" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function ImportIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M8 10.5V2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M4.5 7 8 3.5 11.5 7"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 13.2h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function ShareIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="3.6" r="1.6" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="12" cy="12.4" r="1.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.4 7.1 10.6 4.4M5.4 8.9l5.2 2.7" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path
        d="M3 8.3 6.2 11.5 13 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AlertIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path
        d="M8 2.3 14.2 13H1.8L8 2.3Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M8 6.6v2.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="8" cy="11.1" r="0.75" fill="currentColor" />
    </svg>
  );
}
