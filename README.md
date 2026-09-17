# Share Tabs

Share a group of browser tabs across Chrome, Firefox, and Safari — **no accounts, no server, no backend of any kind.** Select tabs, then copy a manifest, export a file, or show a QR code. On the other end, paste it, drop in the file, or scan the code, preview what's about to open, and open it in a new window (or the current one).

Everything happens on-device. The extension never makes a network request, never stores your tabs anywhere but in-memory during that popup session, and requests exactly one permission (`tabs`). Remote favicons are not loaded in the UI, so opening the popup cannot phone home to the sites you have open.

## How it works

```
Select tabs  →  Bundle (JSON)  →  Copy text / Export file / Show QR
                                              │
                                              ▼
                              Paste text / Choose file / Scan QR
                                              │
                                              ▼
                                    Preview  →  Open tabs
```

- **Bundle** — an ordered, versioned list of `{ title, url }` records (`lib/tab-bundle.ts`). Only `http`/`https` links are considered shareable; browser-internal pages (`chrome://`, `about:`, `*-extension://`, etc.) are automatically filtered out and reported. Bundles are capped at 300 tabs to keep the UI and QR encoder well-behaved.
- **Transports** — all three (copy, file, QR) encode the *same* canonical bundle (`lib/share-codec.ts`):
  - **Text / file**: human-readable JSON — you can open the exported `.sharetabs.json` file in any text editor.
  - **QR code**: the same JSON, compressed with `lz-string`, to fit meaningfully more tabs into one scannable code. If a selection is too large to fit safely in a single QR code, the app tells you and suggests copy/export instead, rather than generating an unreliable, overly-dense code.
  - Plain newline-separated URL lists are also accepted on import, for interop with other tools.
- **Import** always re-validates and re-filters the incoming data before showing a preview — nothing opens without you reviewing it first, and a corrupted or hand-edited manifest can't smuggle in a `javascript:` or `chrome://` URL.

## Project layout

| Path | Purpose |
| --- | --- |
| `lib/tab-bundle.ts` | Pure bundle logic: filtering, deduping, capping, validating (no DOM/browser APIs). |
| `lib/share-codec.ts` | Encodes a bundle to text/QR payloads and decodes any of the accepted formats back. |
| `lib/qr.ts` | DOM-facing QR rendering (`qrcode`) and frame decoding (`jsqr`). |
| `lib/browser-tabs.ts` | The only file that touches WebExtension `tabs`/`windows` APIs, plus clipboard/file helpers. |
| `hooks/useImportPreview.ts` | Shared "decode → preview → open" state, used by both the Import view and the Scan page. |
| `components/` | Popup/scan UI pieces (tab list, bundle preview, status banners, inline icons). |
| `entrypoints/popup/` | The toolbar popup — Share and Import views. |
| `entrypoints/scan/` | A dedicated full-page camera scanner (`/scan.html`), opened in a new tab since camera UI doesn't work well inside a small popup. |
| `assets/main.css` | The shared "travel manifest" visual theme (parchment/ink palette, ticket-perforation lists, no external fonts). |
| `tests/` | Vitest unit tests for the bundle/codec logic and the `tabs`/`windows` wrapper (via `@webext-core/fake-browser`). |

## Requirements

- Node.js 18+ and npm.
- To load and test the built extensions: Chrome/Edge (or another Chromium browser), Firefox, and — for Safari — a Mac with Xcode installed.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev            # Chrome/Chromium, with hot reload
npm run dev:firefox    # Firefox
npm run dev:safari     # Safari (opens Safari; see "Safari" section below for signing)
```

## Building

```bash
npm run build          # → .output/chrome-mv3   (MV3, also works for Edge/Brave/etc.)
npm run build:firefox  # → .output/firefox-mv2  (MV2, Firefox's current default)
npm run build:safari   # → .output/safari-mv2   (MV2, Safari's current default)
npm run build:all      # all three
npm run zip            # zip the Chrome build for store upload
npm run zip:firefox    # zip the Firefox build for AMO upload
```

WXT defaults to Manifest V3 for Chromium browsers and Manifest V2 for Firefox/Safari (their current recommended baseline). If you want an MV3 build for Firefox or Safari instead, pass `--mv3`, e.g. `npx wxt build -b safari --mv3`.

## Loading the extension for manual testing

**Chrome / Edge / Brave (Chromium):**
1. `npm run build`
2. Go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `.output/chrome-mv3`.

**Firefox:**
1. `npm run build:firefox`
2. Go to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and select any file inside `.output/firefox-mv2` (e.g. `manifest.json`).
3. Temporary add-ons are removed when Firefox closes. For a persistent local install, sign the build with `web-ext sign` (requires a free AMO API key) or submit it to AMO.

**Safari (macOS only):**
1. `npm run build:safari`
2. Convert the build into an Xcode project using Apple's official packager:
   ```bash
   npm run package:safari
   # equivalent to:
   # xcrun safari-web-extension-converter .output/safari-mv2 --swift --bundle-identifier com.sharetabs.extension
   ```
3. Open the generated Xcode project, select your Team for code signing, and run the macOS app target — this installs the extension into Safari.
4. In Safari, enable **Settings → Advanced → Show features for web developers**, then **Settings → Developer → Allow Unsigned Extensions** (needed for local, un-notarized builds), and enable the extension under **Settings → Extensions**.
5. For distribution, you'll need an Apple Developer account to notarize and submit the app (containing the extension) through the App Store — see [Apple's Safari web extensions guide](https://developer.apple.com/documentation/safariservices/safari-web-extensions).

Safari's WebExtension support has some gaps relative to Chrome/Firefox (notably around `webRequest` in MV3), but this extension only relies on `tabs`, `windows`, and standard web platform APIs (clipboard, file, camera), all of which Safari supports.

## Permissions

Only **`tabs`** — needed to read open tabs' titles/URLs and to open new ones. There are no host permissions, no background script/service worker, no analytics, and no remote code; everything (including the QR encoder/decoder) ships bundled inside the extension.

The popup does **not** load `http(s)` favicon URLs. Browsers often hand those back as remote addresses; fetching them would be a network request and would tell those hosts which sites you have open. Only already-in-memory icons (`data:`, `chrome://`, `*-extension://`) are shown.

Firefox requires new AMO submissions to declare `browser_specific_settings.gecko.data_collection_permissions`; this extension declares `required: ["none"]` since it collects and transmits nothing (see `wxt.config.ts`).

Before publishing to any store, replace the placeholder Firefox extension ID (`share-tabs@example.com` in `wxt.config.ts`) with your own, and consider swapping the default WXT icon in `public/icon/` for your own artwork.

Do not commit `.wxt/` (generated types contain absolute paths from your machine), `.output/`, `web-ext.config.ts`, `.env` files, or code-signing keys.

## Testing

```bash
npm test          # run once
npm run test:watch
npm run compile   # tsc --noEmit
```

Unit tests cover:
- Filtering, deduping, capping, and validating tab bundles, including malformed/oversized/tampered input (`tests/tab-bundle.test.ts`).
- Round-tripping through the text and QR codecs, plain-URL-list interoperability, and the QR size/fallback threshold (`tests/share-codec.test.ts`).
- The `tabs`/`windows` wrapper — listing tabs, opening a bundle into a new vs. current window, and filtering out non-shareable URLs at open-time — using `@webext-core/fake-browser`'s in-memory mock (`tests/browser-tabs.test.ts`).

These cover all the logic that doesn't require a real browser UI. Camera-based QR scanning, the popup's live tab list, and cross-browser visual/interaction QA still need a manual pass in each real browser (see the "Loading the extension" steps above) — automated headless testing of a loaded extension's popup/camera flow across Chrome, Firefox, and Safari is outside what this environment can drive directly.

### Suggested manual smoke test (per browser)

1. Open a window with 3–5 tabs, open the popup, confirm they're all listed and selected.
2. **Copy manifest** → paste into the Import view → preview matches → **Open tabs** → confirms a new window opens with the same tabs, in order.
3. **Export file** → re-select the downloaded `.sharetabs.json` in Import → same check.
4. **Show QR code** → open `/scan.html` (or another device/browser) → **Scan a manifest** → grant camera access → point at the code → preview appears → open tabs.
5. Try importing something invalid (e.g. random prose, or a `chrome://` link) and confirm you get a clear error instead of a crash or an opened internal page.

## Known limitations

- Desktop only (Chrome, Firefox, Safari on macOS). Mobile browser extension platforms differ too much for a single codebase to target reliably.
- QR codes have a practical size limit; very large tab groups will be told to use copy/export instead.
- Tab **titles** are captured at share time; if a tab was still loading, its title (and therefore the shared title) may just be the URL.
- URLs that include embedded credentials (`https://user:pass@host/…`) are rewritten to drop the userinfo before they are copied, exported, shown as a QR code, or opened. Query strings are kept as-is, so tokens in `?access_token=` still need a careful look at the preview.

## License

[MIT](./LICENSE)
