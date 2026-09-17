/**
 * The only file that talks to WebExtension tab/window APIs and browser-only
 * DOM APIs (clipboard, file download/read). Keeping this isolated means the
 * bundle/codec logic stays portable and testable, and any Chrome/Firefox/
 * Safari quirks are handled in exactly one place.
 */
import { sanitizeShareableUrl, type RawTabInput } from './tab-bundle';

export interface DisplayTab {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  /** False for browser-internal pages (chrome://, about:, etc.) that can't
   * be portably shared or reopened in another browser. */
  shareable: boolean;
}

/** Lists every tab in the current window, including non-shareable ones so
 * the UI can show (and explain) them as disabled rather than silently
 * hiding them. */
export async function listCurrentWindowTabs(): Promise<DisplayTab[]> {
  const tabs = await browser.tabs.query({ currentWindow: true });
  return tabs
    .filter((tab): tab is typeof tab & { id: number } => typeof tab.id === 'number')
    .map((tab) => {
      const sanitized = sanitizeShareableUrl(tab.url);
      return {
        id: tab.id,
        title: tab.title?.trim() || sanitized || tab.url || 'Untitled tab',
        url: sanitized ?? tab.url ?? '',
        favIconUrl: tab.favIconUrl,
        shareable: sanitized !== null,
      };
    });
}

export type OpenTarget = 'new-window' | 'current-window';

/**
 * Opens the given tabs, defensively re-filtering to shareable URLs (in case
 * an imported/scanned payload was tampered with after validation). Returns
 * the number of tabs actually opened. Opens tabs one-by-one via the
 * `tabs`/`windows` APIs rather than `windows.create({ url: [...] })`, which
 * is not reliably supported the same way across Chrome, Firefox, and
 * Safari.
 */
export async function openTabs(tabs: RawTabInput[], target: OpenTarget = 'new-window'): Promise<number> {
  const urls = tabs
    .map((tab) => sanitizeShareableUrl(tab.url))
    .filter((url): url is string => url !== null);
  if (urls.length === 0) {
    throw new Error('No shareable links to open.');
  }

  if (target === 'new-window') {
    const [first, ...rest] = urls as [string, ...string[]];
    const win = await browser.windows.create({ url: first, focused: true });
    const windowId = win?.id;
    for (const url of rest) {
      await browser.tabs.create({
        ...(typeof windowId === 'number' ? { windowId } : {}),
        url,
        active: false,
      });
    }
  } else {
    const current = await browser.windows.getCurrent();
    for (const url of urls) {
      await browser.tabs.create({ windowId: current.id, url, active: false });
    }
  }

  return urls.length;
}

/**
 * Favicons from `tabs.query()` are often remote `http(s)` URLs. Loading
 * those in the popup would make a network request (and leak which sites
 * you have open) the moment the extension is clicked. Only in-extension /
 * already-in-memory icon URLs are safe to render.
 */
export function isEmbeddedFaviconUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const protocol = new URL(url).protocol;
    return (
      protocol === 'data:' ||
      protocol === 'blob:' ||
      protocol === 'chrome:' ||
      protocol === 'chrome-extension:' ||
      protocol === 'moz-extension:' ||
      protocol === 'safari-extension:' ||
      protocol === 'safari-web-extension:' ||
      protocol === 'edge:' ||
      protocol === 'about:'
    );
  } catch {
    return false;
  }
}

/** Copies text using the async Clipboard API, falling back to a hidden
 * textarea + execCommand for contexts where it's unavailable. */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    const copied = document.execCommand('copy');
    if (!copied) {
      throw new Error('Could not copy to clipboard.');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

/** Triggers a browser file download of the given text content. */
export function downloadTextFile(filename: string, content: string, mimeType = 'application/json'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads a `File` (e.g. from an `<input type="file">`) as text. */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}

/** Turns a bundle name (or fallback) into a safe filename stem. */
export function slugifyFilename(name: string | null | undefined): string {
  const base = (name && name.trim()) || 'tabs';
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'tabs';
}
