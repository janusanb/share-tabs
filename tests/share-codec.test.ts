import { describe, expect, it } from 'vitest';
import {
  QR_MAX_PAYLOAD_CHARS,
  decodeSharePayload,
  encodeBundleToQrPayload,
  encodeBundleToText,
  getQrEncoding,
} from '../lib/share-codec';
import { BundleParseError, buildBundle, type TabBundle } from '../lib/tab-bundle';

function makeBundle(count: number, name: string | null = 'My Trip'): TabBundle {
  const rawTabs = Array.from({ length: count }, (_, i) => ({
    title: `Tab ${i}`,
    url: `https://example.com/${i}`,
  }));
  return buildBundle(rawTabs, { name }).bundle;
}

describe('text round trip', () => {
  it('encodes to readable JSON and decodes back to an equivalent bundle', () => {
    const bundle = makeBundle(3);
    const text = encodeBundleToText(bundle);

    expect(text).toContain('"format": "share-tabs"');

    const result = decodeSharePayload(text);
    expect(result.source).toBe('manifest');
    expect(result.bundle.tabs).toEqual(bundle.tabs);
    expect(result.bundle.name).toBe(bundle.name);
    expect(result.report.included).toBe(3);
  });
});

describe('QR round trip', () => {
  it('encodes to a compact payload and decodes back to an equivalent bundle', () => {
    const bundle = makeBundle(5);
    const payload = encodeBundleToQrPayload(bundle);

    // Sanity check it's meaningfully more compact than the readable form.
    expect(payload.length).toBeLessThan(encodeBundleToText(bundle).length);

    const result = decodeSharePayload(payload);
    expect(result.source).toBe('qr');
    expect(result.bundle.tabs).toEqual(bundle.tabs);
  });

  it('reports whether a bundle fits the safe QR payload budget', () => {
    const small = getQrEncoding(makeBundle(2));
    expect(small.fits).toBe(true);

    const huge = getQrEncoding(makeBundle(300));
    expect(huge.payload.length).toBeGreaterThan(QR_MAX_PAYLOAD_CHARS);
    expect(huge.fits).toBe(false);
  });
});

describe('plain text interoperability', () => {
  it('accepts a bare newline-separated list of URLs', () => {
    const result = decodeSharePayload('https://example.com/a\nhttps://example.com/b');
    expect(result.source).toBe('plain-text');
    expect(result.bundle.tabs.map((t) => t.url)).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ]);
  });

  it('reports skipped invalid lines mixed in with valid URLs', () => {
    const result = decodeSharePayload('https://example.com/a\nnot a url\nhttps://example.com/b');
    expect(result.bundle.tabs).toHaveLength(2);
    expect(result.report.skippedInvalidUrl).toBe(1);
  });
});

describe('malformed input handling', () => {
  it('throws a friendly error for empty input', () => {
    expect(() => decodeSharePayload('   ')).toThrow(BundleParseError);
  });

  it('throws a friendly error for JSON that is not a share-tabs manifest', () => {
    expect(() => decodeSharePayload('{"hello":"world"}')).toThrow(BundleParseError);
  });

  it('throws a friendly error for JSON with an unsupported version', () => {
    const badManifest = JSON.stringify({ format: 'share-tabs', version: 999, tabs: [] });
    expect(() => decodeSharePayload(badManifest)).toThrow(BundleParseError);
  });

  it('throws a friendly error for text with no usable links at all', () => {
    expect(() => decodeSharePayload('just some prose, no links here')).toThrow(BundleParseError);
  });

  it('rejects a corrupt/garbage QR-looking payload by falling through to plain text handling', () => {
    expect(() => decodeSharePayload('####not-real-base64####')).toThrow(BundleParseError);
  });
});

describe('ordering and duplicates survive the round trip', () => {
  it('preserves tab order end to end', () => {
    const bundle = makeBundle(8);
    const decoded = decodeSharePayload(encodeBundleToText(bundle));
    expect(decoded.bundle.tabs.map((t) => t.url)).toEqual(bundle.tabs.map((t) => t.url));
  });
});
