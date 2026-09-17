import { useCallback, useState } from 'react';
import { openTabs, type OpenTarget } from '@/lib/browser-tabs';
import { decodeSharePayload, type DecodeResult } from '@/lib/share-codec';

/**
 * Shared "decode untrusted text into a previewable bundle, then open it"
 * logic used by both the Import view (pasted text / uploaded file) and the
 * Scan page (decoded QR string). Keeping this in one hook means both
 * surfaces get identical validation, error messages, and open behavior.
 */
export function useImportPreview() {
  const [result, setResult] = useState<DecodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openTarget, setOpenTarget] = useState<OpenTarget>('new-window');
  const [opening, setOpening] = useState(false);
  const [openedCount, setOpenedCount] = useState<number | null>(null);

  const applyText = useCallback((text: string) => {
    setOpenedCount(null);
    if (!text.trim()) {
      setResult(null);
      setError(null);
      return;
    }
    try {
      setResult(decodeSharePayload(text));
      setError(null);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Could not read that manifest.');
    }
  }, []);

  const applyError = useCallback((message: string) => {
    setResult(null);
    setOpenedCount(null);
    setError(message);
  }, []);

  const open = useCallback(async () => {
    if (!result) return;
    setOpening(true);
    setError(null);
    try {
      const count = await openTabs(result.bundle.tabs, openTarget);
      setOpenedCount(count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open those tabs.');
    } finally {
      setOpening(false);
    }
  }, [result, openTarget]);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setOpenedCount(null);
  }, []);

  return { result, error, openTarget, setOpenTarget, opening, openedCount, applyText, applyError, open, reset };
}
