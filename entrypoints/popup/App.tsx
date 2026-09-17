import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BundlePreview } from '@/components/BundlePreview';
import { CameraIcon, CopyIcon, DownloadIcon, ImportIcon, QrIcon, ShareIcon } from '@/components/Icons';
import { StatusBanner } from '@/components/StatusBanner';
import { TabRow } from '@/components/TabRow';
import { useImportPreview } from '@/hooks/useImportPreview';
import {
  copyTextToClipboard,
  downloadTextFile,
  listCurrentWindowTabs,
  readFileAsText,
  slugifyFilename,
  type DisplayTab,
} from '@/lib/browser-tabs';
import { QrTooLargeError, renderBundleQrCode } from '@/lib/qr';
import { encodeBundleToText } from '@/lib/share-codec';
import { buildBundle } from '@/lib/tab-bundle';

type View = 'share' | 'import';
type CopyState = 'idle' | 'copied' | 'failed';

function openScanPage() {
  browser.tabs.create({ url: browser.runtime.getURL('/scan.html') });
}

function ShareView() {
  const [tabs, setTabs] = useState<DisplayTab[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bundleName, setBundleName] = useState('');
  const [loading, setLoading] = useState(true);
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCurrentWindowTabs()
      .then((loaded) => {
        if (cancelled) return;
        setTabs(loaded);
        setSelected(new Set(loaded.filter((t) => t.shareable).map((t) => t.id)));
      })
      .catch((err) => {
        if (!cancelled) setActionError(err instanceof Error ? err.message : 'Could not read open tabs.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const shareableTabs = useMemo(() => tabs.filter((t) => t.shareable), [tabs]);
  const skippedCount = tabs.length - shareableTabs.length;

  const toggleTab = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => setSelected(new Set(shareableTabs.map((t) => t.id)));
  const selectNone = () => setSelected(new Set());

  const buildSelectedBundle = useCallback(() => {
    const rawTabs = tabs
      .filter((t) => selected.has(t.id))
      .map((t) => ({ title: t.title, url: t.url }));
    return buildBundle(rawTabs, { name: bundleName }).bundle;
  }, [tabs, selected, bundleName]);

  const resetTransientState = () => {
    setCopyState('idle');
    setQrDataUrl(null);
    setQrError(null);
    setActionError(null);
  };

  const handleCopy = async () => {
    resetTransientState();
    const bundle = buildSelectedBundle();
    try {
      await copyTextToClipboard(encodeBundleToText(bundle));
      setCopyState('copied');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyState('idle'), 2000);
    } catch (err) {
      setCopyState('failed');
      setActionError(err instanceof Error ? err.message : 'Could not copy to clipboard.');
    }
  };

  const handleDownload = () => {
    resetTransientState();
    const bundle = buildSelectedBundle();
    downloadTextFile(`${slugifyFilename(bundle.name)}.sharetabs.json`, encodeBundleToText(bundle));
  };

  const handleShowQr = async () => {
    resetTransientState();
    const bundle = buildSelectedBundle();
    try {
      const dataUrl = await renderBundleQrCode(bundle);
      setQrDataUrl(dataUrl);
    } catch (err) {
      setQrError(err instanceof QrTooLargeError ? err.message : 'Could not generate a QR code.');
    }
  };

  const selectedCount = selected.size;

  return (
    <div className="view">
      <p className="lede">
        Select the tabs from this window you want to share. Nothing leaves your device until you copy,
        export, or show a QR code.
      </p>

      {loading ? (
        <p className="muted">Reading open tabs…</p>
      ) : tabs.length === 0 ? (
        <p className="muted">No tabs found in this window.</p>
      ) : (
        <>
          <div className="tab-list__toolbar">
            <div className="select-actions">
              <button type="button" className="link-btn" onClick={selectAll}>
                Select all
              </button>
              <span aria-hidden="true">·</span>
              <button type="button" className="link-btn" onClick={selectNone}>
                Select none
              </button>
            </div>
            <span className="muted">{selectedCount} selected</span>
          </div>

          <ul className="tab-list">
            {tabs.map((tab) => (
              <TabRow key={tab.id} tab={tab} checked={selected.has(tab.id)} onToggle={toggleTab} />
            ))}
          </ul>

          {skippedCount > 0 && (
            <p className="fine-print">
              {skippedCount} browser-internal tab{skippedCount === 1 ? '' : 's'} can’t be shared.
            </p>
          )}

          <label className="field">
            <span>Manifest name (optional)</span>
            <input
              type="text"
              placeholder="e.g. Kitchen remodel research"
              value={bundleName}
              onChange={(e) => setBundleName(e.target.value)}
              maxLength={120}
            />
          </label>

          <div className="action-grid">
            <button type="button" className="btn" onClick={handleCopy} disabled={selectedCount === 0}>
              <CopyIcon />
              {copyState === 'copied' ? 'Copied!' : 'Copy manifest'}
            </button>
            <button type="button" className="btn" onClick={handleDownload} disabled={selectedCount === 0}>
              <DownloadIcon />
              Export file
            </button>
            <button type="button" className="btn" onClick={handleShowQr} disabled={selectedCount === 0}>
              <QrIcon />
              Show QR code
            </button>
          </div>

          {actionError && <StatusBanner tone="error">{actionError}</StatusBanner>}
          {qrError && <StatusBanner tone="error">{qrError}</StatusBanner>}

          {qrDataUrl && (
            <div className="qr-panel">
              <img src={qrDataUrl} alt={`QR code for ${selectedCount} shared tabs`} />
              <p className="fine-print">Scan this with another device’s Share Tabs extension.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ImportView() {
  const { result, error, openTarget, setOpenTarget, opening, openedCount, applyText, applyError, open, reset } =
    useImportPreview();
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePasteChange = (value: string) => {
    setPasteText(value);
    applyText(value);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      setPasteText(text);
      applyText(text);
    } catch (err) {
      applyError(err instanceof Error ? err.message : 'Could not read that file.');
    }
  };

  const handleReset = () => {
    setPasteText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    reset();
  };

  return (
    <div className="view">
      <p className="lede">Paste a manifest someone sent you, drop in a file, or scan a QR code.</p>

      {!result && (
        <>
          <label className="field">
            <span>Paste manifest text or links</span>
            <textarea
              rows={6}
              placeholder={'{ "format": "share-tabs", ... }\nor one URL per line'}
              value={pasteText}
              onChange={(e) => handlePasteChange(e.target.value)}
            />
          </label>

          <div className="import-row">
            <label className="btn btn--file">
              <ImportIcon />
              Choose a file
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.sharetabs.json,.txt,text/plain,application/json"
                onChange={(e) => handleFile(e.target.files?.[0])}
                hidden
              />
            </label>
            <button type="button" className="btn" onClick={openScanPage}>
              <CameraIcon />
              Scan QR code
            </button>
          </div>

          {error && <StatusBanner tone="error">{error}</StatusBanner>}
        </>
      )}

      {result && (
        <>
          <BundlePreview
            bundle={result.bundle}
            report={result.report}
            openTarget={openTarget}
            onOpenTargetChange={setOpenTarget}
            onOpen={open}
            opening={opening}
            openedCount={openedCount}
          />
          {error && <StatusBanner tone="error">{error}</StatusBanner>}
          <button type="button" className="link-btn" onClick={handleReset}>
            Start over
          </button>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>('share');

  return (
    <main className="popup">
      <header className="popup__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            ✂︎
          </span>
          <div>
            <h1>Share Tabs</h1>
            <p className="brand__tag">no accounts · no server · your device only</p>
          </div>
        </div>
      </header>

      <nav className="tabs-nav" role="tablist" aria-label="Share or import tabs">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'share'}
          className={`tabs-nav__btn${view === 'share' ? ' is-active' : ''}`}
          onClick={() => setView('share')}
        >
          <ShareIcon />
          Share
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'import'}
          className={`tabs-nav__btn${view === 'import' ? ' is-active' : ''}`}
          onClick={() => setView('import')}
        >
          <ImportIcon />
          Import
        </button>
      </nav>

      {view === 'share' ? <ShareView /> : <ImportView />}
    </main>
  );
}
