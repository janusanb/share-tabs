import type { OpenTarget } from '@/lib/browser-tabs';
import type { BuildReport, TabBundle } from '@/lib/tab-bundle';
import { StatusBanner } from '@/components/StatusBanner';

interface BundlePreviewProps {
  bundle: TabBundle;
  report: BuildReport;
  openTarget: OpenTarget;
  onOpenTargetChange: (target: OpenTarget) => void;
  onOpen: () => void;
  opening: boolean;
  openedCount: number | null;
}

function reportNotes(report: BuildReport): string[] {
  const notes: string[] = [];
  if (report.skippedInvalidUrl > 0) {
    notes.push(`${report.skippedInvalidUrl} skipped (not a shareable http/https link)`);
  }
  if (report.skippedDuplicate > 0) {
    notes.push(`${report.skippedDuplicate} skipped (duplicate)`);
  }
  if (report.skippedTruncated > 0) {
    notes.push(`${report.skippedTruncated} skipped (over the per-manifest limit)`);
  }
  return notes;
}

export function BundlePreview({
  bundle,
  report,
  openTarget,
  onOpenTargetChange,
  onOpen,
  opening,
  openedCount,
}: BundlePreviewProps) {
  const notes = reportNotes(report);

  return (
    <div className="bundle-preview">
      <div className="bundle-preview__header">
        <h2>{bundle.name || 'Untitled manifest'}</h2>
        <span className="bundle-preview__count">
          {bundle.tabs.length} tab{bundle.tabs.length === 1 ? '' : 's'}
        </span>
      </div>

      {notes.length > 0 && (
        <StatusBanner tone="info">{notes.join(' · ')}</StatusBanner>
      )}

      <ol className="bundle-preview__list">
        {bundle.tabs.map((tab) => (
          <li key={tab.url}>
            <span className="bundle-preview__title">{tab.title}</span>
            <span className="bundle-preview__url">{tab.url}</span>
          </li>
        ))}
      </ol>

      <fieldset className="open-target">
        <legend>Open in</legend>
        <label>
          <input
            type="radio"
            name="open-target"
            checked={openTarget === 'new-window'}
            onChange={() => onOpenTargetChange('new-window')}
          />
          A new window
        </label>
        <label>
          <input
            type="radio"
            name="open-target"
            checked={openTarget === 'current-window'}
            onChange={() => onOpenTargetChange('current-window')}
          />
          This window
        </label>
      </fieldset>

      <button type="button" className="btn btn--primary" onClick={onOpen} disabled={opening}>
        {opening ? 'Opening…' : `Open ${bundle.tabs.length} tab${bundle.tabs.length === 1 ? '' : 's'}`}
      </button>

      {openedCount !== null && (
        <StatusBanner tone="success">Opened {openedCount} tabs.</StatusBanner>
      )}
    </div>
  );
}
