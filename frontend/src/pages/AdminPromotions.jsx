import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { CheckCircle, XCircle, Warning } from '@phosphor-icons/react';
import ReactDiffViewer from 'react-diff-viewer-continued';

export default function AdminPromotions() {
  const promotions = useStore((s) => s.promotions);
  const fetchPendingPromotions = useStore((s) => s.fetchPendingPromotions);
  const approvePromotion = useStore((s) => s.approvePromotion);
  const rejectPromotion = useStore((s) => s.rejectPromotion);

  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchPendingPromotions();
  }, [fetchPendingPromotions]);

  if (promotions?.loading) {
    return (
      <div className="flex items-center gap-3 py-20 justify-center text-[oklch(0.65_0_0)] text-sm">
        <div className="w-5 h-5 border-2 border-[oklch(0.55_0.15_145)] border-t-transparent rounded-full animate-spin" />
        Loading promotions…
      </div>
    );
  }

  const items = promotions?.items || [];

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-2 py-12 text-center text-[oklch(0.65_0_0)]">
        <div className="text-lg">No promotions awaiting review.</div>
        <div className="text-sm opacity-60">All caught up.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-medium text-[oklch(0.95_0_0)]">
        Promotion approvals{' '}
        <span className="text-base text-[oklch(0.60_0_0)] font-normal">
          ({items.length})
        </span>
      </h1>

      {items.map((p) => (
        <section
          key={p.candidate_id}
          className="rounded-lg bg-[oklch(0.18_0_0)] p-5 shadow"
        >
          {/* Header */}
          <header className="mb-3 flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-[oklch(0.55_0_0)] mb-1 font-mono">
                {p.candidate_id}
              </div>
              <h2 className="text-lg font-medium text-[oklch(0.95_0_0)]">
                {p.question}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[oklch(0.65_0_0)] shrink-0 mt-1">
              {p.state === 'first_ack' ? (
                <>
                  <Warning size={14} className="text-[oklch(0.75_0.15_80)]" />
                  <span>awaiting second admin</span>
                  {p.first_admin && (
                    <span className="text-[oklch(0.50_0_0)]">
                      · first: {p.first_admin}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[oklch(0.65_0.10_145)]" />
                  pending first review
                </>
              )}
            </div>
          </header>

          {/* SQL diff */}
          <div className="rounded border border-[oklch(0.25_0_0)] bg-[oklch(0.12_0_0)] overflow-hidden text-sm">
            <ReactDiffViewer
              oldValue=""
              newValue={p.proposed_sql}
              splitView={false}
              useDarkTheme
            />
          </div>

          {/* Actions */}
          <footer className="mt-4 flex gap-3">
            <button
              type="button"
              className="flex items-center gap-2 rounded-md bg-[oklch(0.55_0.15_145)] px-4 py-2 text-sm font-medium text-[oklch(0.98_0_0)] hover:bg-[oklch(0.60_0.15_145)] transition-colors"
              onClick={() => approvePromotion(p.candidate_id)}
              aria-label="Approve"
            >
              <CheckCircle size={16} weight="bold" />
              Approve
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md bg-[oklch(0.30_0.05_25)] px-4 py-2 text-sm font-medium text-[oklch(0.85_0_0)] hover:bg-[oklch(0.35_0.08_25)] transition-colors"
              onClick={() => {
                setRejectingId(p.candidate_id);
                setRejectReason('');
              }}
              aria-label="Reject"
            >
              <XCircle size={16} weight="bold" />
              Reject
            </button>
          </footer>

          {/* Reject inline form */}
          {rejectingId === p.candidate_id && (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                placeholder="reason for reject"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="flex-1 rounded-md border border-[oklch(0.30_0_0)] bg-[oklch(0.14_0_0)] px-3 py-1.5 text-sm text-[oklch(0.95_0_0)] placeholder:text-[oklch(0.45_0_0)] focus:outline-none focus:border-[oklch(0.45_0_0)]"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setRejectingId(null);
                    setRejectReason('');
                  }
                }}
                autoFocus
              />
              <button
                type="button"
                className="rounded-md bg-[oklch(0.55_0.15_25)] px-3 py-1.5 text-sm font-medium text-[oklch(0.98_0_0)] hover:bg-[oklch(0.60_0.15_25)] transition-colors"
                onClick={() => {
                  rejectPromotion(p.candidate_id, rejectReason);
                  setRejectingId(null);
                  setRejectReason('');
                }}
                aria-label="Confirm"
              >
                Confirm
              </button>
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-sm text-[oklch(0.55_0_0)] hover:text-[oklch(0.75_0_0)] transition-colors"
                onClick={() => {
                  setRejectingId(null);
                  setRejectReason('');
                }}
                aria-label="Cancel"
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
