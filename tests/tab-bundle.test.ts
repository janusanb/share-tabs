import { describe, expect, it } from 'vitest';
import {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  BundleParseError,
  MAX_TABS_PER_BUNDLE,
  buildBundle,
  isShareableUrl,
  parseCanonicalBundleJson,
  parsePlainTextUrls,
} from '../lib/tab-bundle';

describe('isShareableUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isShareableUrl('https://example.com')).toBe(true);
    expect(isShareableUrl('http://example.com/path?q=1')).toBe(true);
  });

  it('rejects browser-internal and unsafe schemes', () => {
    expect(isShareableUrl('chrome://extensions')).toBe(false);
    expect(isShareableUrl('about:blank')).toBe(false);
    expect(isShareableUrl('edge://settings')).toBe(false);
    expect(isShareableUrl('chrome-extension://abcdef/page.html')).toBe(false);
    expect(isShareableUrl('moz-extension://abcdef/page.html')).toBe(false);
    expect(isShareableUrl('file:///Users/me/file.pdf')).toBe(false);
    expect(isShareableUrl('javascript:alert(1)')).toBe(false);
    expect(isShareableUrl('data:text/html,hi')).toBe(false);
  });

  it('rejects malformed or missing URLs', () => {
    expect(isShareableUrl(undefined)).toBe(false);
    expect(isShareableUrl(null)).toBe(false);
    expect(isShareableUrl('')).toBe(false);
    expect(isShareableUrl('not a url')).toBe(false);
  });

  it('treats URLs with embedded credentials as shareable', () => {
    expect(isShareableUrl('https://user:supersecret@example.com/path')).toBe(true);
  });
});

describe('buildBundle', () => {
  it('builds a versioned bundle preserving order', () => {
    const { bundle, report } = buildBundle([
      { title: 'Example', url: 'https://example.com/' },
      { title: 'Docs', url: 'https://example.com/docs' },
    ]);

    expect(bundle.format).toBe(BUNDLE_FORMAT);
    expect(bundle.version).toBe(BUNDLE_VERSION);
    expect(bundle.tabs).toEqual([
      { title: 'Example', url: 'https://example.com/' },
      { title: 'Docs', url: 'https://example.com/docs' },
    ]);
    expect(report).toEqual({
      totalInput: 2,
      included: 2,
      skippedInvalidUrl: 0,
      skippedDuplicate: 0,
      skippedTruncated: 0,
    });
  });

  it('falls back to the URL as the title when none is given', () => {
    const { bundle } = buildBundle([{ url: 'https://example.com/no-title' }]);
    expect(bundle.tabs[0]?.title).toBe('https://example.com/no-title');
  });

  it('filters out non-shareable URLs and reports how many were skipped', () => {
    const { bundle, report } = buildBundle([
      { title: 'Good', url: 'https://example.com' },
      { title: 'Internal', url: 'chrome://extensions' },
      { title: 'Bad', url: 'not-a-url' },
      { title: 'Empty', url: '' },
    ]);
    expect(bundle.tabs).toHaveLength(1);
    expect(report.included).toBe(1);
    expect(report.skippedInvalidUrl).toBe(3);
  });

  it('deduplicates by URL, ignoring the fragment, and keeps first occurrence', () => {
    const { bundle, report } = buildBundle([
      { title: 'First', url: 'https://example.com/page#section-1' },
      { title: 'Second', url: 'https://example.com/page#section-2' },
      { title: 'Third', url: 'https://example.com/page' },
    ]);
    expect(bundle.tabs).toHaveLength(1);
    expect(bundle.tabs[0]?.title).toBe('First');
    expect(report.skippedDuplicate).toBe(2);
  });

  it('caps the number of tabs and reports truncation', () => {
    const rawTabs = Array.from({ length: 10 }, (_, i) => ({
      title: `Tab ${i}`,
      url: `https://example.com/${i}`,
    }));
    const { bundle, report } = buildBundle(rawTabs, { maxTabs: 3 });
    expect(bundle.tabs).toHaveLength(3);
    expect(report.included).toBe(3);
    expect(report.skippedTruncated).toBe(7);
  });

  it('trims and caps the bundle name', () => {
    const { bundle } = buildBundle([{ url: 'https://example.com' }], {
      name: `  ${'x'.repeat(200)}  `,
    });
    expect(bundle.name).toHaveLength(120);
  });

  it('treats a blank name as no name', () => {
    const { bundle } = buildBundle([{ url: 'https://example.com' }], { name: '   ' });
    expect(bundle.name).toBeNull();
  });

  it('strips embedded credentials so they are never written into a manifest', () => {
    const { bundle } = buildBundle([
      { title: 'Secret', url: 'https://user:supersecret@example.com/path?q=1#hash' },
    ]);
    expect(bundle.tabs).toEqual([
      { title: 'Secret', url: 'https://example.com/path?q=1#hash' },
    ]);
    expect(JSON.stringify(bundle)).not.toContain('supersecret');
    expect(JSON.stringify(bundle)).not.toContain('user');
  });

  it('respects the default MAX_TABS_PER_BUNDLE cap', () => {
    const rawTabs = Array.from({ length: MAX_TABS_PER_BUNDLE + 5 }, (_, i) => ({
      url: `https://example.com/${i}`,
    }));
    const { report } = buildBundle(rawTabs);
    expect(report.included).toBe(MAX_TABS_PER_BUNDLE);
    expect(report.skippedTruncated).toBe(5);
  });
});

describe('parseCanonicalBundleJson', () => {
  it('extracts tabs and name from a well-formed manifest', () => {
    const { name, rawTabs } = parseCanonicalBundleJson({
      format: BUNDLE_FORMAT,
      version: 1,
      name: 'Research',
      createdAt: '2024-01-01T00:00:00.000Z',
      tabs: [{ title: 'A', url: 'https://a.example' }],
    });
    expect(name).toBe('Research');
    expect(rawTabs).toEqual([{ title: 'A', url: 'https://a.example' }]);
  });

  it('rejects non-object input', () => {
    expect(() => parseCanonicalBundleJson('just a string')).toThrow(BundleParseError);
    expect(() => parseCanonicalBundleJson(null)).toThrow(BundleParseError);
    expect(() => parseCanonicalBundleJson([1, 2, 3])).toThrow(BundleParseError);
  });

  it('rejects objects with the wrong format tag', () => {
    expect(() => parseCanonicalBundleJson({ format: 'something-else', tabs: [] })).toThrow(BundleParseError);
  });

  it('rejects a missing or non-numeric version', () => {
    expect(() => parseCanonicalBundleJson({ format: BUNDLE_FORMAT, tabs: [] })).toThrow(BundleParseError);
  });

  it('rejects a future/unsupported version', () => {
    expect(() =>
      parseCanonicalBundleJson({ format: BUNDLE_FORMAT, version: BUNDLE_VERSION + 1, tabs: [] }),
    ).toThrow(BundleParseError);
  });

  it('rejects a manifest missing the tabs array', () => {
    expect(() => parseCanonicalBundleJson({ format: BUNDLE_FORMAT, version: 1 })).toThrow(BundleParseError);
  });

  it('tolerates malformed individual tab entries instead of throwing', () => {
    const { rawTabs } = parseCanonicalBundleJson({
      format: BUNDLE_FORMAT,
      version: 1,
      tabs: [null, 42, { url: 'https://ok.example' }, { title: 'no url' }],
    });
    expect(rawTabs).toHaveLength(4);
    expect(rawTabs[2]).toEqual({ title: undefined, url: 'https://ok.example' });
  });
});

describe('parsePlainTextUrls', () => {
  it('parses one URL per line, ignoring blanks and comments', () => {
    const rawTabs = parsePlainTextUrls(`
      https://example.com/a

      # a comment
      https://example.com/b
    `);
    expect(rawTabs.map((t) => t.url)).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('supports "Title <TAB> URL" formatted lines', () => {
    const rawTabs = parsePlainTextUrls('My Page\thttps://example.com/page');
    expect(rawTabs).toEqual([{ title: 'My Page', url: 'https://example.com/page' }]);
  });

  it('passes through non-URL lines for buildBundle to reject and report', () => {
    const rawTabs = parsePlainTextUrls('not a url at all');
    expect(rawTabs).toEqual([{ url: 'not a url at all' }]);
    const { report } = buildBundle(rawTabs);
    expect(report.skippedInvalidUrl).toBe(1);
  });
});
