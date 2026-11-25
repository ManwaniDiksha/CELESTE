import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Clock, Phone, Sparkles, UserCheck, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { formatInr, formatIsoTime, formatMinutes, isValidTenDigitPhone, previewAnyAvailableStylist, sanitizePhoneDigits } from '../utils/formatters.js';
import { BohoCornerLeaf, BohoEyebrow } from './BohoAccents.jsx';
import { QueueStatusBadge, StaffAvatar } from './StatusBadges.jsx';

export function WalkInModal({
  open,
  onClose,
  onSubmit,
  services = [],
  qualifications = [],
  staffCards = [],
  maxServices = 3,
}) {
  const { t, lang, pick, labelCategory } = useLanguage();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [serviceIds, setServiceIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState('any_available');
  const [preferredStaffId, setPreferredStaffId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setPhone('');
    setServiceIds([]);
    setSelectionMode('any_available');
    setPreferredStaffId('');
    setError('');
  }, [open]);

  const qualByStaff = useMemo(() => {
    const map = new Map();
    for (const q of qualifications) {
      if (!map.has(q.staff_id)) map.set(q.staff_id, new Set());
      map.get(q.staff_id).add(q.service_id);
    }
    return map;
  }, [qualifications]);

  const enrichedStaff = useMemo(
    () =>
      staffCards.map((s) => ({
        ...s,
        qualified_service_ids: Array.from(qualByStaff.get(s.id) || []),
        workload_minutes: s.waiting_count ? s.waiting_count * 30 : s.current_entry ? 20 : 0,
      })),
    [staffCards, qualByStaff]
  );

  const anyPreview = useMemo(
    () => previewAnyAvailableStylist(enrichedStaff, serviceIds),
    [enrichedStaff, serviceIds]
  );

  const isStaffSelectable = (member) => {
    if (!member.is_on_duty || member.availability_status === 'On Break') return false;
    const set = qualByStaff.get(member.id) || new Set();
    return serviceIds.every((id) => set.has(id));
  };

  useEffect(() => {
    if (selectionMode === 'specific' && preferredStaffId) {
      const chosen = staffCards.find((s) => s.id === preferredStaffId);
      if (!chosen || !isStaffSelectable(chosen)) {
        setPreferredStaffId('');
      }
    }
  });

  if (!open) return null;

  const toggleService = (id) => {
    setError('');
    setServiceIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= maxServices) return prev;
      return [...prev, id];
    });
  };

  const canSubmit =
    name.trim().length > 0 &&
    isValidTenDigitPhone(phone) &&
    serviceIds.length >= 1 &&
    serviceIds.length <= maxServices &&
    (selectionMode === 'any_available' ? anyPreview.hasEligibleStaff : Boolean(preferredStaffId)) &&
    !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        name: name.trim(),
        phone,
        serviceIds,
        selectionMode,
        ...(selectionMode === 'specific' ? { preferredStaffId } : {}),
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Unable to add walk-in customer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="celeste-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-charcoal-green/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div className="celeste-modal-panel celeste-double-frame flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-warm-terracotta/65 bg-white shadow-2xl">
        <div className="celeste-linen-surface relative flex items-center justify-between overflow-hidden border-b border-warm-terracotta/40 bg-warm-sand/55 px-6 py-4">
          <BohoCornerLeaf className="pointer-events-none absolute right-8 top-0 h-16 w-16 text-warm-terracotta/45" />
          <h2 className="relative font-serif text-2xl font-semibold text-charcoal-green">
            {t('receptionWalkInTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="relative cursor-pointer rounded-lg p-1.5 text-charcoal-green/65 transition hover:bg-soft-sage active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-charcoal-green/70">
                {t('joinNameLabel')} *
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('joinNamePlaceholder')}
                className="mt-1.5 w-full rounded-xl border border-champagne/80 bg-warm-ivory/60 px-3.5 py-2.5 text-sm focus:border-celeste-sage focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-charcoal-green/70">
                {t('joinPhoneLabel')} *
              </label>
              <input
                type="tel"
                inputMode="numeric"
                required
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(sanitizePhoneDigits(e.target.value))}
                placeholder={t('joinPhonePlaceholder')}
                className="mt-1.5 w-full rounded-xl border border-champagne/80 bg-warm-ivory/60 px-3.5 py-2.5 text-sm tabular-nums focus:border-celeste-sage focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-charcoal-green/70">
                {t('joinServicesHeading')}
              </p>
              <span className="text-xs font-semibold text-deep-sage">
                {t('joinSelectedCount', { count: serviceIds.length, max: maxServices })}
              </span>
            </div>

            <div className="mt-2.5 grid max-h-56 gap-2 overflow-y-auto rounded-2xl border border-champagne/50 bg-warm-ivory/40 p-3 sm:grid-cols-2">
              {services.map((svc) => {
                const selected = serviceIds.includes(svc.id);
                const disabled = !selected && serviceIds.length >= maxServices;
                return (
                  <button
                    key={svc.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleService(svc.id)}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                      selected
                        ? 'border-celeste-sage bg-soft-sage font-semibold text-deep-sage'
                        : 'border-champagne/60 bg-white text-charcoal-green hover:border-celeste-sage/45 disabled:opacity-45'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate">{pick(svc, 'name')}</p>
                      <p className="text-[11px] text-charcoal-green/60">
                        {labelCategory(svc.category)} · {formatMinutes(svc.duration_minutes, lang)} ·{' '}
                        {formatInr(svc.price_inr)}
                      </p>
                    </div>
                    {selected && <Check className="h-4 w-4 shrink-0 text-celeste-sage" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-charcoal-green/70">
              {t('joinStaffHeading')}
            </p>
            <div className="mt-2.5 space-y-2">
              <button
                type="button"
                disabled={serviceIds.length > 0 && !anyPreview.hasEligibleStaff}
                onClick={() => {
                  setSelectionMode('any_available');
                  setPreferredStaffId('');
                }}
                className={`flex w-full cursor-pointer items-center justify-between rounded-xl border px-4 py-2.5 text-left text-xs transition ${
                  selectionMode === 'any_available'
                    ? 'border-celeste-sage bg-soft-sage font-semibold text-deep-sage'
                    : 'border-champagne/65 bg-white hover:bg-warm-ivory disabled:opacity-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-celeste-sage" />
                  <span>{t('joinAnyStylistTitle')}</span>
                </span>
                {anyPreview.projectedStaff && (
                  <span className="text-[11px] text-deep-sage">
                    {pick(anyPreview.projectedStaff, 'name')}
                  </span>
                )}
              </button>

              <div className="grid gap-2 sm:grid-cols-3">
                {staffCards.map((member) => {
                  const ok = isStaffSelectable(member);
                  const active = selectionMode === 'specific' && preferredStaffId === member.id;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      disabled={!ok}
                      onClick={() => {
                        setSelectionMode('specific');
                        setPreferredStaffId(member.id);
                      }}
                      className={`cursor-pointer rounded-xl border px-3 py-2 text-left text-xs transition ${
                        active
                          ? 'border-celeste-sage bg-soft-sage font-semibold text-deep-sage'
                          : 'border-champagne/65 bg-white text-charcoal-green hover:bg-warm-ivory disabled:cursor-not-allowed disabled:opacity-45'
                      }`}
                    >
                      <p className="font-semibold">{pick(member, 'name')}</p>
                      <p className="mt-0.5 text-[11px] text-charcoal-green/65">
                        {member.availability_status} · {member.waiting_count ?? 0}{' '}
                        {t('waitingSuffix')}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rosewood/40 bg-rosewood/10 p-3 text-xs font-medium text-rosewood">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-warm-terracotta/35 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="celeste-btn-secondary cursor-pointer rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              {t('cancelAction')}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="celeste-btn-primary cursor-pointer rounded-xl px-5 py-2.5 text-sm font-semibold"
            >
              {submitting ? t('joinSubmitting') : t('receptionAddWalkIn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CorrectEntryModal({
  entry,
  onClose,
  onSubmit,
  services = [],
  qualifications = [],
  maxServices = 3,
}) {
  const { t, lang, pick } = useLanguage();
  const [name, setName] = useState('');
  const [serviceIds, setServiceIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!entry) return;
    setName(entry.customer_name || '');
    setServiceIds((entry.services || []).map((s) => s.service_id).filter(Boolean));
    setError('');
  }, [entry]);

  const qualifiedSet = useMemo(() => {
    if (!entry?.assigned_staff?.id) return new Set();
    return new Set(
      qualifications
        .filter((q) => q.staff_id === entry.assigned_staff.id)
        .map((q) => q.service_id)
    );
  }, [entry, qualifications]);

  if (!entry) return null;

  const toggleService = (id) => {
    setError('');
    setServiceIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxServices) return prev;
      return [...prev, id];
    });
  };

  const canSave =
    name.trim().length > 0 &&
    serviceIds.length >= 1 &&
    serviceIds.length <= maxServices &&
    !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSave) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(entry.entry_id, {
        name: name.trim(),
        serviceIds,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Unable to update queue entry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="celeste-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-charcoal-green/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div className="celeste-modal-panel celeste-double-frame flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-warm-terracotta/65 bg-white shadow-2xl">
        <div className="celeste-linen-surface relative flex items-center justify-between overflow-hidden border-b border-warm-terracotta/40 bg-warm-sand/55 px-6 py-4">
          <BohoCornerLeaf className="pointer-events-none absolute right-8 top-0 h-16 w-16 text-warm-terracotta/45" />
          <div className="relative">
            <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
              {t('receptionEditTitle')} · {entry.token_display}
            </h2>
            <p className="mt-0.5 text-xs text-charcoal-green/70">{t('receptionEditNote')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="relative cursor-pointer rounded-lg p-1.5 text-charcoal-green/65 transition hover:bg-soft-sage active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-charcoal-green/70">
              {t('joinNameLabel')} *
            </label>
            <input
              type="text"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-champagne/80 bg-warm-ivory/60 px-3.5 py-2.5 text-sm focus:border-celeste-sage focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-charcoal-green/70">
                {t('joinServicesHeading')}
              </p>
              <span className="text-xs font-semibold text-deep-sage">
                {t('joinSelectedCount', { count: serviceIds.length, max: maxServices })}
              </span>
            </div>

            <div className="mt-2.5 grid max-h-60 gap-2 overflow-y-auto rounded-2xl border border-champagne/50 bg-warm-ivory/40 p-3 sm:grid-cols-2">
              {services.map((svc) => {
                const selected = serviceIds.includes(svc.id);
                const qualified = qualifiedSet.has(svc.id);
                const disabled = !qualified || (!selected && serviceIds.length >= maxServices);
                return (
                  <button
                    key={svc.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleService(svc.id)}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                      selected
                        ? 'border-celeste-sage bg-soft-sage font-semibold text-deep-sage'
                        : 'border-champagne/60 bg-white text-charcoal-green hover:border-celeste-sage/45 disabled:cursor-not-allowed disabled:opacity-40'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate">{pick(svc, 'name')}</p>
                      <p className="text-[11px] text-charcoal-green/60">
                        {formatMinutes(svc.duration_minutes, lang)} · {formatInr(svc.price_inr)}
                        {!qualified
                          ? lang === 'gu'
                            ? ' (લાયક નથી)'
                            : ' (stylist not qualified)'
                          : ''}
                      </p>
                    </div>
                    {selected && <Check className="h-4 w-4 shrink-0 text-celeste-sage" />}
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rosewood/40 bg-rosewood/10 p-3 text-xs font-medium text-rosewood">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-champagne/45 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-xl border border-champagne bg-warm-ivory px-4 py-2.5 text-sm font-medium text-charcoal-green"
            >
              {t('cancelAction')}
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="cursor-pointer rounded-xl bg-celeste-sage px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-deep-sage disabled:opacity-50"
            >
              {t('saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EntryDetailModal({ detail, loading, error, onClose }) {
  const { t, lang, pick, pickSnapshotName } = useLanguage();

  if (!detail && !loading && !error) return null;

  return (
    <div
      className="celeste-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-charcoal-green/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div className="celeste-modal-panel celeste-double-frame w-full max-w-lg overflow-hidden rounded-3xl border border-warm-terracotta/65 bg-white p-6 shadow-2xl">
        <div className="relative flex items-start justify-between gap-3 border-b border-warm-terracotta/40 pb-4">
          <div>
            <BohoEyebrow>{t('receptionDetails')}</BohoEyebrow>
            <h2 className="mt-1 font-serif text-3xl font-semibold text-charcoal-green">
              {detail?.token_display || '—'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-charcoal-green/65 transition hover:bg-soft-sage active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && <p className="py-8 text-center text-sm text-charcoal-green/70">{t('loadingText')}</p>}
        {error && <p className="py-6 text-center text-sm text-rosewood">{error}</p>}

        {detail && !loading && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-charcoal-green">{detail.customer_name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 tabular-nums text-charcoal-green/75">
                  <Phone className="h-3.5 w-3.5 text-celeste-sage" />
                  <span>{detail.customer_phone || '—'}</span>
                </p>
              </div>
              <QueueStatusBadge status={detail.status} size="lg" />
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-champagne/55 bg-warm-ivory/60 p-3.5">
              <StaffAvatar staff={detail.assigned_staff} size="md" />
              <div>
                <p className="text-xs text-charcoal-green/65">{t('statusAssignedStylist')}</p>
                <p className="font-semibold text-charcoal-green">{pick(detail.assigned_staff, 'name')}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-champagne/55 bg-warm-ivory/40 p-3.5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-charcoal-green/60">
                {t('statusServicesSelected')}
              </p>
              <ul className="space-y-1.5">
                {(detail.services || []).map((svc, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{pickSnapshotName(svc)}</span>
                    <span className="tabular-nums text-charcoal-green/75">
                      {formatMinutes(svc.duration_minutes_snapshot, lang)} · {formatInr(svc.price_inr_snapshot)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2.5 flex justify-between border-t border-champagne/45 pt-2 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-celeste-sage" />
                  {formatMinutes(detail.total_duration_minutes, lang)}
                </span>
                <span className="text-deep-sage">{formatInr(detail.total_price_inr)}</span>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-xs text-charcoal-green/75">
              <div className="rounded-xl bg-warm-ivory p-2.5">
                <dt>{t('statusJoinedAt')}</dt>
                <dd className="mt-0.5 font-semibold text-charcoal-green">
                  {formatIsoTime(detail.joined_at, lang)}
                </dd>
              </div>
              <div className="rounded-xl bg-warm-ivory p-2.5">
                <dt>{t('receptionSourceModeLabel')}</dt>
                <dd className="mt-0.5 font-semibold text-charcoal-green">
                  {detail.source} · {detail.selection_mode}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
