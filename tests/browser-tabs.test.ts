import { fakeBrowser } from '@webext-core/fake-browser';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadTextFile, isEmbeddedFaviconUrl, listCurrentWindowTabs, openTabs, slugifyFilename } from '../lib/browser-tabs';

// `lib/browser-tabs.ts` references the WXT-provided global `browser`. In the
// real extension this is injected by WXT's unimport plugin; here we point it
// at `@webext-core/fake-browser`'s in-memory implementation instead.
// @ts-expect-error -- test-only global wiring
globalThis.browser = fakeBrowser;

beforeEach(() => {
  fakeBrowser.reset();
});

/** fake-browser has no "current" window until one is explicitly focused —
 * unlike a real browser, which always has one. Set that up for tests that
 * rely on `currentWindow: true` / `windows.getCurrent()`. */
async function focusedWindow() {
  return fakeBrowser.windows.create({ focused: true });
}

describe('listCurrentWindowTabs', () => {
  it('lists tabs in the current window and flags shareable ones', async () => {
    await focusedWindow();
    await fakeBrowser.tabs.create({ url: 'https://example.com/a' });
    await fakeBrowser.tabs.create({ url: 'chrome://extensions' });

    const tabs = await listCurrentWindowTabs();
    expect(tabs).toHaveLength(2);
    expect(tabs.find((t) => t.url === 'https://example.com/a')?.shareable).toBe(true);
    expect(tabs.find((t) => t.url === 'chrome://extensions')?.shareable).toBe(false);
  });

  it('falls back to the URL as the title for untitled tabs', async () => {
    await focusedWindow();
    await fakeBrowser.tabs.create({ url: 'https://example.com/no-title' });

    const [tab] = await listCurrentWindowTabs();
    expect(tab?.title).toBe('https://example.com/no-title');
  });

  it('strips embedded credentials from listed tab URLs', async () => {
    await focusedWindow();
    await fakeBrowser.tabs.create({ url: 'https://user:supersecret@example.com/a' });

    const tabs = await listCurrentWindowTabs();
    expect(tabs.map((t) => t.url)).toContain('https://example.com/a');
    expect(JSON.stringify(tabs)).not.toContain('supersecret');
  });
});

describe('openTabs', () => {
  it('opens the first URL via windows.create (avoiding an extra blank tab) and the rest via tabs.create', async () => {
    const before = await fakeBrowser.windows.getAll();
    const createWindowSpy = vi.spyOn(fakeBrowser.windows, 'create');

    const count = await openTabs(
      [{ url: 'https://example.com/1' }, { url: 'https://example.com/2' }],
      'new-window',
    );
    expect(count).toBe(2);
    expect(createWindowSpy).toHaveBeenCalledWith({ url: 'https://example.com/1', focused: true });

    const after = await fakeBrowser.windows.getAll();
    expect(after).toHaveLength(before.length + 1);

    // fake-browser's `windows.create({ url })` doesn't synthesize the
    // initial tab the way real browsers do (the spy assertion above already
    // covers that the first URL was requested correctly) — only the
    // *additional* tab created via `tabs.create` is observable here.
    const newWindow = after.find((w) => !before.some((b) => b.id === w.id));
    const tabsInNewWindow = await fakeBrowser.tabs.query({ windowId: newWindow?.id });
    expect(tabsInNewWindow.map((t) => t.url)).toEqual(['https://example.com/2']);

    createWindowSpy.mockRestore();
  });

  it('opens shareable URLs as new tabs in the current window', async () => {
    const win = await focusedWindow();
    const windowId = win!.id;
    const windowsBefore = await fakeBrowser.windows.getAll();
    const tabsBefore = await fakeBrowser.tabs.query({ windowId });

    const count = await openTabs([{ url: 'https://example.com/1' }], 'current-window');
    expect(count).toBe(1);

    const windowsAfter = await fakeBrowser.windows.getAll();
    expect(windowsAfter).toHaveLength(windowsBefore.length); // no new window was created

    const tabsAfter = await fakeBrowser.tabs.query({ windowId });
    expect(tabsAfter).toHaveLength(tabsBefore.length + 1);
    expect(tabsAfter.map((t) => t.url)).toContain('https://example.com/1');
  });

  it('defensively filters out non-shareable URLs before opening', async () => {
    const count = await openTabs(
      [{ url: 'https://example.com/ok' }, { url: 'chrome://settings' }, { url: 'javascript:alert(1)' }],
      'new-window',
    );
    expect(count).toBe(1);
  });

  it('strips embedded credentials before opening', async () => {
    const createWindowSpy = vi.spyOn(fakeBrowser.windows, 'create');

    const count = await openTabs([{ url: 'https://user:supersecret@example.com/ok' }], 'new-window');
    expect(count).toBe(1);
    expect(createWindowSpy).toHaveBeenCalledWith({ url: 'https://example.com/ok', focused: true });

    createWindowSpy.mockRestore();
  });

  it('throws when there is nothing shareable to open', async () => {
    await expect(openTabs([{ url: 'chrome://settings' }], 'new-window')).rejects.toThrow(
      'No shareable links to open.',
    );
  });
});

describe('slugifyFilename', () => {
  it('slugifies a bundle name', () => {
    expect(slugifyFilename('Kitchen Remodel Research!')).toBe('kitchen-remodel-research');
  });

  it('falls back to "tabs" for empty or missing names', () => {
    expect(slugifyFilename(null)).toBe('tabs');
    expect(slugifyFilename('   ')).toBe('tabs');
  });
});

describe('isEmbeddedFaviconUrl', () => {
  it('allows in-memory and extension-local icon URLs', () => {
    expect(isEmbeddedFaviconUrl('data:image/png;base64,abc')).toBe(true);
    expect(isEmbeddedFaviconUrl('chrome://favicon/https://example.com')).toBe(true);
    expect(isEmbeddedFaviconUrl('chrome-extension://abcdef/icon.png')).toBe(true);
    expect(isEmbeddedFaviconUrl('moz-extension://abcdef/icon.png')).toBe(true);
  });

  it('rejects remote URLs so the popup never fetches them', () => {
    expect(isEmbeddedFaviconUrl('https://example.com/favicon.ico')).toBe(false);
    expect(isEmbeddedFaviconUrl('http://example.com/favicon.ico')).toBe(false);
    expect(isEmbeddedFaviconUrl('https://www.google.com/s2/favicons?domain=example.com')).toBe(false);
    expect(isEmbeddedFaviconUrl(undefined)).toBe(false);
  });
});

describe('downloadTextFile', () => {
  it('creates and clicks a temporary download link without throwing', () => {
    // happy-dom implements enough of the Blob/URL/anchor APIs for this to
    // exercise the real code path end to end.
    expect(() => downloadTextFile('tabs.json', '{}', 'application/json')).not.toThrow();
  });
});
