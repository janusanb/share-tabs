/**
 * Turns a `TabBundle` into the three shareable transports (readable text,
 * QR payload) and parses any of them — plus plain URL lists — back into a
 * validated bundle. All logic here is pure (no DOM, no extension APIs), and
 * bundled locally (no remote code), so it works identically in the popup,
 * the scan page, and unit tests.
 */
import * as LZString from 'lz-string';
import {
  BundleParseError,
  buildBundle,
  parseCanonicalBundleJson,
  parsePlainTextUrls,
  type BuildReport,
  type TabBundle,
} from './tab-bundle';

/**
 * Conservative cap on the compressed QR payload size. Real QR codes can
 * hold up to ~2.9KB in byte mode at the largest (version 40) size, but
 * codes that dense are slow and unreliable to scan with a phone or webcam.
 * Capping well below the theoretical max keeps generated codes scannable.
 */
export const QR_MAX_PAYLOAD_CHARS = 1500;

/** Canonical, human-readable form used for clipboard copy and file export. */
export function encodeBundleToText(bundle: TabBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/** Compact form used for QR codes: the same canonical JSON, compressed. */
export function encodeBundleToQrPayload(bundle: TabBundle): string {
  return LZString.compressToBase64(JSON.stringify(bundle));
}

export interface QrEncoding {
  payload: string;
  fits: boolean;
}

/** Encodes a bundle for QR and reports whether it fits the safe size budget. */
export function getQrEncoding(bundle: TabBundle): QrEncoding {
  const payload = encodeBundleToQrPayload(bundle);
  return { payload, fits: payload.length <= QR_MAX_PAYLOAD_CHARS };
}

export type DecodeSource = 'manifest' | 'qr' | 'plain-text';

export interface DecodeResult {
  bundle: TabBundle;
  report: BuildReport;
  source: DecodeSource;
}

function tryParseJsonManifest(text: string): { bundle: TabBundle; report: BuildReport } | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = parseCanonicalBundleJson(json); // throws BundleParseError on bad shape
  return buildBundle(parsed.rawTabs, { name: parsed.name });
}

function tryDecompressManifest(text: string): { bundle: TabBundle; report: BuildReport } | null {
  let decompressed: string | null = null;
  try {
    decompressed = LZString.decompressFromBase64(text);
  } catch {
    return null;
  }
  if (!decompressed) return null;

  let json: unknown;
  try {
    json = JSON.parse(decompressed);
  } catch {
    return null;
  }
  try {
    const parsed = parseCanonicalBundleJson(json);
    return buildBundle(parsed.rawTabs, { name: parsed.name });
  } catch {
    return null;
  }
}

/**
 * Accepts anything a user might paste, upload, or scan and turns it into a
 * validated bundle: a canonical JSON manifest (from copy/export), a
 * compressed QR payload, or a plain list of URLs. Throws `BundleParseError`
 * with a message safe to show directly to the user when nothing usable is
 * found.
 */
export function decodeSharePayload(raw: string): DecodeResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new BundleParseError('Nothing to import yet — paste a manifest, or choose a file.');
  }

  if (trimmed.startsWith('{')) {
    try {
      const outcome = tryParseJsonManifest(trimmed);
      if (outcome) return { ...outcome, source: 'manifest' };
    } catch (err) {
      if (err instanceof BundleParseError) throw err;
    }
  }

  const compressed = tryDecompressManifest(trimmed);
  if (compressed) {
    return { ...compressed, source: 'qr' };
  }

  const rawTabs = parsePlainTextUrls(trimmed);
  const outcome = buildBundle(rawTabs, {});
  if (outcome.bundle.tabs.length === 0) {
    throw new BundleParseError('Could not find any shareable http(s) links in that text.');
  }
  return { ...outcome, source: 'plain-text' };
}

export { BundleParseError };
