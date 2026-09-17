/**
 * DOM-facing QR helpers: rendering a bundle to an image, and reading a QR
 * payload string out of a decoded video frame. Both `qrcode` and `jsqr` are
 * bundled with the extension (no remote code, no network calls).
 */
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { getQrEncoding } from './share-codec';
import type { TabBundle } from './tab-bundle';

export class QrTooLargeError extends Error {}

/** Parchment-and-ink palette, matching the extension's visual theme. */
const QR_DARK = '#241c12ff';
const QR_LIGHT = '#f6ecd9ff';

/**
 * Renders a bundle as a QR code data URL. Throws `QrTooLargeError` if the
 * bundle doesn't fit within the safe QR payload budget — callers should
 * catch this and suggest copy/export instead.
 */
export async function renderBundleQrCode(bundle: TabBundle): Promise<string> {
  const { payload, fits } = getQrEncoding(bundle);
  if (!fits) {
    throw new QrTooLargeError(
      'This selection has too many tabs to fit in a single QR code. Try copying the text or exporting a file instead.',
    );
  }
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 6,
    color: { dark: QR_DARK, light: QR_LIGHT },
  });
}

/**
 * Attempts to read a QR code out of a single camera frame. Returns the raw
 * decoded string (to be passed to `decodeSharePayload`) or `null` if no
 * code was found in this frame.
 */
export function readQrStringFromFrame(imageData: ImageData): string | null {
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'dontInvert',
  });
  return code?.data || null;
}
