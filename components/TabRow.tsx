import { useState } from 'react';
import { isEmbeddedFaviconUrl, type DisplayTab } from '@/lib/browser-tabs';

interface TabRowProps {
  tab: DisplayTab;
  checked: boolean;
  onToggle: (id: number) => void;
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`;
  } catch {
    return url;
  }
}

export function TabRow({ tab, checked, onToggle }: TabRowProps) {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const disabled = !tab.shareable;

  return (
    <li className={`tab-row${disabled ? ' tab-row--disabled' : ''}`}>
      <label className="tab-row__label">
        <input
          type="checkbox"
          checked={checked && !disabled}
          disabled={disabled}
          onChange={() => onToggle(tab.id)}
          aria-describedby={disabled ? `tab-${tab.id}-reason` : undefined}
        />
        <span className="tab-row__favicon" aria-hidden="true">
          {isEmbeddedFaviconUrl(tab.favIconUrl) && !faviconFailed ? (
            <img src={tab.favIconUrl} alt="" onError={() => setFaviconFailed(true)} />
          ) : (
            <span className="tab-row__favicon-dot" />
          )}
        </span>
        <span className="tab-row__text">
          <span className="tab-row__title">{tab.title}</span>
          <span className="tab-row__url">{shortUrl(tab.url)}</span>
        </span>
      </label>
      {disabled && (
        <span id={`tab-${tab.id}-reason`} className="tab-row__reason">
          not shareable
        </span>
      )}
    </li>
  );
}
