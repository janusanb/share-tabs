import { useCallback, useEffect, useRef, useState } from 'react';
import { BundlePreview } from '@/components/BundlePreview';
import { StatusBanner } from '@/components/StatusBanner';
import { useImportPreview } from '@/hooks/useImportPreview';
import { readQrStringFromFrame } from '@/lib/qr';

type CameraState = 'idle' | 'starting' | 'scanning' | 'denied' | 'unavailable' | 'found';

export default function App() {
  const { result, error, openTarget, setOpenTarget, opening, openedCount, applyText, open, reset } =
    useImportPreview();

  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [showManual, setShowManual] = useState(false);
  const [manualText, setManualText] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const tick = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = readQrStringFromFrame(imageData);
    if (code) {
      applyText(code);
      setCameraState('found');
      stopCamera();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [applyText, stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraState('scanning');
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setCameraState(name === 'NotFoundError' ? 'unavailable' : 'denied');
    }
  }, [tick]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScanAgain = () => {
    reset();
    setManualText('');
    startCamera();
  };

  const handleManualChange = (value: string) => {
    setManualText(value);
    applyText(value);
  };

  return (
    <main className="scan-page">
      <header className="popup__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            ✂︎
          </span>
          <div>
            <h1>Scan a manifest</h1>
            <p className="brand__tag">Point your camera at a Share Tabs QR code</p>
          </div>
        </div>
      </header>

      {!result && (
        <div className="scan-stage">
          <div className={`scan-viewport${cameraState === 'scanning' ? ' is-live' : ''}`}>
            <video ref={videoRef} playsInline muted aria-hidden="true" />
            <canvas ref={canvasRef} hidden />
            {cameraState !== 'scanning' && (
              <div className="scan-viewport__overlay">
                {cameraState === 'starting' && <p>Starting camera…</p>}
                {cameraState === 'denied' && (
                  <p>
                    Camera access was blocked. Enable camera permission for this extension in your browser
                    settings, then reload this page — or paste a manifest below instead.
                  </p>
                )}
                {cameraState === 'unavailable' && <p>No camera was found on this device.</p>}
              </div>
            )}
            {cameraState === 'scanning' && <div className="scan-viewport__frame" aria-hidden="true" />}
          </div>

          {(cameraState === 'denied' || cameraState === 'unavailable') && (
            <button type="button" className="btn" onClick={startCamera}>
              Try camera again
            </button>
          )}

          <button type="button" className="link-btn" onClick={() => setShowManual((s) => !s)}>
            {showManual ? 'Hide manual paste' : 'No camera? Paste a manifest instead'}
          </button>

          {showManual && (
            <label className="field">
              <span>Paste manifest text or links</span>
              <textarea
                rows={5}
                value={manualText}
                onChange={(e) => handleManualChange(e.target.value)}
                placeholder="Paste what the other device copied or exported"
              />
            </label>
          )}

          {error && <StatusBanner tone="error">{error}</StatusBanner>}
        </div>
      )}

      {result && (
        <>
          <StatusBanner tone="success">Manifest found — review before opening.</StatusBanner>
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
          <button type="button" className="link-btn" onClick={handleScanAgain}>
            Scan another
          </button>
        </>
      )}
    </main>
  );
}
