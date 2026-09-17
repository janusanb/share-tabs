/**
 * Pure, browser-independent logic for representing a "tab bundle" — an
 * ordered, versioned list of tabs that can be shared as text, a file, or a
 * QR code. Nothing in this file touches the DOM or any WebExtension API, so
 * it can be unit tested in isolation and reused by every transport.
 */

export const BUNDLE_FORMAT = 'share-tabs' as const;
export const BUNDLE_VERSION = 1 as const;

/** Hard cap on tabs per bundle. Protects the UI and QR encoder from
 * pathological input (e.g. a huge pasted document or a malicious file). */
export const MAX_TABS_PER_BUNDLE = 300;

/** Only these schemes are considered safe and portable to share and reopen
 * across machines and browsers. Notably excluded: chrome://, about:,
 * edge://, *-extension://, file://, javascript:, data: */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export interface TabRecord {
  title: string;
  url: string;
}

export interface TabBundle {
  format: typeof BUNDLE_FORMAT;
  version: typeof BUNDLE_VERSION;
  name: string | null;
  createdAt: string;
  tabs: TabRecord[];
}

/** Loosely-typed input accepted from either `browser.tabs.query()` results
 * or untrusted imported data. */
export interface RawTabInput {
  title?: string | null;
  url?: string | null;
}

export interface BuildReport {
  totalInput: number;
  included: number;
  skippedInvalidUrl: number;
  skippedDuplicate: number;
  skippedTruncated: number;
}

export class BundleParseError extends Error {}

/**
 * Returns a portable http(s) URL with embedded credentials removed, or
 * `null` if the input isn't shareable. Stripping `user:pass@` is important:
 * those secrets would otherwise be copied into manifests, files, and QR
 * codes and then reopened on another machine.
 */
export function sanitizeShareableUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
    if (parsed.username || parsed.password) {
      parsed.username = '';
      parsed.password = '';
      return parsed.toString();
    }
    return trimmed;
  } catch {
    return null;
  }
}

export function isShareableUrl(url: string | null | undefined): boolean {
  return sanitizeShareableUrl(url) !== null;
}

function normalizeUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url;
  }
}

function normalizeTitle(title: string | null | undefined, url: string): string {
  const trimmed = title?.trim();
  return trimmed && trimmed.length > 0 ? trimmed.slice(0, 300) : url;
}

/**
 * Filters, deduplicates, caps, and normalizes a raw list of tabs into a
 * versioned bundle, plus a report describing anything that was dropped.
 * Used both when capturing tabs from the current window and when accepting
 * untrusted imported/pasted/scanned data.
 */
export function buildBundle(
  rawTabs: RawTabInput[],
  options: { name?: string | null; maxTabs?: number } = {},
): { bundle: TabBundle; report: BuildReport } {
  const maxTabs = options.maxTabs ?? MAX_TABS_PER_BUNDLE;
  const seen = new Set<string>();
  const tabs: TabRecord[] = [];
  let skippedInvalidUrl = 0;
  let skippedDuplicate = 0;
  let skippedTruncated = 0;

  for (const raw of rawTabs) {
    const url = sanitizeShareableUrl(raw.url);
    if (!url) {
      skippedInvalidUrl++;
      continue;
    }
    const key = normalizeUrlKey(url);
    if (seen.has(key)) {
      skippedDuplicate++;
      continue;
    }
    if (tabs.length >= maxTabs) {
      skippedTruncated++;
      continue;
    }
    seen.add(key);
    tabs.push({ title: normalizeTitle(raw.title, url), url });
  }

  const bundle: TabBundle = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    name: options.name?.trim() ? options.name.trim().slice(0, 120) : null,
    createdAt: new Date().toISOString(),
    tabs,
  };

  return {
    bundle,
    report: {
      totalInput: rawTabs.length,
      included: tabs.length,
      skippedInvalidUrl,
      skippedDuplicate,
      skippedTruncated,
    },
  };
}

/**
 * Validates and extracts the raw tab list + name from parsed JSON that
 * claims to be a share-tabs bundle. Throws `BundleParseError` with a
 * human-readable message for anything malformed or unsupported, but does
 * NOT itself filter/dedupe URLs — pass the result through `buildBundle` for
 * that, so both fresh captures and re-imported bundles get the same
 * validation and caps applied.
 */
export function parseCanonicalBundleJson(json: unknown): { name: string | null; rawTabs: RawTabInput[] } {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new BundleParseError('That doesn’t look like a tab manifest (expected a JSON object).');
  }
  const obj = json as Record<string, unknown>;

  if (obj.format !== BUNDLE_FORMAT) {
    throw new BundleParseError('That file isn’t a Share Tabs manifest.');
  }
  if (typeof obj.version !== 'number' || !Number.isFinite(obj.version)) {
    throw new BundleParseError('That manifest is missing a version number.');
  }
  if (obj.version > BUNDLE_VERSION) {
    throw new BundleParseError(
      `That manifest was created by a newer version of Share Tabs (v${obj.version}). Please update the extension.`,
    );
  }
  if (!Array.isArray(obj.tabs)) {
    throw new BundleParseError('That manifest is missing its list of tabs.');
  }

  const rawTabs: RawTabInput[] = obj.tabs.map((entry): RawTabInput => {
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      return {
        title: typeof record.title === 'string' ? record.title : undefined,
        url: typeof record.url === 'string' ? record.url : undefined,
      };
    }
    return {};
  });

  return {
    name: typeof obj.name === 'string' ? obj.name : null,
    rawTabs,
  };
}

/**
 * Best-effort parser for plain text that isn't a Share Tabs manifest — one
 * URL per line, optionally as `Title <TAB> https://...` (a format produced
 * by some "copy all tab URLs" tools). Anything that isn't a plausible
 * http(s) URL is left for `buildBundle` to report as skipped.
 */
export function parsePlainTextUrls(text: string): RawTabInput[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line): RawTabInput => {
      const tabSeparated = line.match(/^(.*)\t+(\S+)$/);
      if (tabSeparated) {
        return { title: tabSeparated[1]!.trim(), url: tabSeparated[2]!.trim() };
      }
      return { url: line };
    });
}
