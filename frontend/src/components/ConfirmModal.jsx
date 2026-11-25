import { useEffect } from 'react';
import { X } from 'lucide-react';
import { BohoCornerLeaf } from './BohoAccents.jsx';

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  loading = false,
  tone = 'rosewood',
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !loading) {
        onCancel?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const confirmStyles =
    tone === 'rosewood'
      ? 'bg-rosewood text-white hover:bg-muted-rose focus-visible:ring-rosewood active:scale-[0.99]'
      : 'celeste-btn-primary';

  return (
    <div
      className="celeste-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-charcoal-green/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div className="celeste-card-elevated celeste-modal-panel celeste-double-frame w-full max-w-md overflow-hidden rounded-3xl border border-warm-terracotta/65">
        <div className="celeste-linen-surface relative flex items-start justify-between gap-4 overflow-hidden border-b border-warm-terracotta/35 bg-warm-sand/55 px-6 py-4">
          <BohoCornerLeaf className="pointer-events-none absolute right-8 top-0 h-14 w-14 text-warm-terracotta/45" />
          <h3 id="confirm-modal-title" className="relative font-serif text-2xl font-semibold text-charcoal-green">
            {title}
          </h3>
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            aria-label="Close"
            className="relative cursor-pointer rounded-lg p-1.5 text-charcoal-green/60 transition hover:bg-soft-sage hover:text-charcoal-green active:scale-95 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm leading-relaxed text-charcoal-green/80">{description}</p>

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={onCancel}
              className="celeste-btn-secondary cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={onConfirm}
              className={`cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${confirmStyles}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
