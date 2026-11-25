import { useEffect, useState } from 'react';
import { AlertCircle, Check, RotateCcw, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { BohoCornerLeaf, BohoEyebrow } from './BohoAccents.jsx';

const SERVICE_CATEGORIES = ['Hair', 'Beard & Grooming', 'Skin', 'Hands & Feet'];

export function ServiceFormModal({
  open,
  mode = 'create',
  initialService = null,
  staffList = [],
  busy = false,
  serverError = '',
  onClose,
  onSubmit,
}) {
  const { t, lang, pick, labelCategory } = useLanguage();

  const [category, setCategory] = useState('Hair');
  const [nameEn, setNameEn] = useState('');
  const [nameGu, setNameGu] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [priceInr, setPriceInr] = useState('250');
  const [isActive, setIsActive] = useState(true);
  const [selectedStaffIds, setSelectedStaffIds] = useState([]);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLocalError('');
    if (mode === 'edit' && initialService) {
      setCategory(initialService.category || 'Hair');
      setNameEn(initialService.name_en || '');
      setNameGu(initialService.name_gu || '');
      setDurationMinutes(String(initialService.duration_minutes ?? 30));
      setPriceInr(String(initialService.price_inr ?? 0));
      setIsActive(Boolean(initialService.is_active));
      setSelectedStaffIds(initialService.qualified_staff_ids || []);
    } else {
      setCategory('Hair');
      setNameEn('');
      setNameGu('');
      setDurationMinutes('30');
      setPriceInr('250');
      setIsActive(true);
      setSelectedStaffIds([]);
    }
  }, [open, mode, initialService]);

  if (!open) return null;

  const toggleStaff = (staffId) => {
    setSelectedStaffIds((prev) =>
      prev.includes(staffId) ? prev.filter((id) => id !== staffId) : [...prev, staffId]
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setLocalError('');

    const trimmedEn = nameEn.trim();
    const trimmedGu = nameGu.trim();
    const dur = Number(durationMinutes);
    const price = Number(priceInr);

    if (!trimmedEn || !trimmedGu) {
      setLocalError(t('adminServiceNameError'));
      return;
    }
    if (!Number.isInteger(dur) || dur <= 0 || dur > 600) {
      setLocalError(t('adminServiceDurationError'));
      return;
    }
    if (!Number.isInteger(price) || price < 0 || price > 500000) {
      setLocalError(t('adminServicePriceError'));
      return;
    }
    if (isActive && selectedStaffIds.length === 0) {
      setLocalError(t('adminActiveServiceCoverageHint'));
      return;
    }

    onSubmit({
      category,
      name_en: trimmedEn,
      name_gu: trimmedGu,
      duration_minutes: dur,
      price_inr: price,
      is_active: isActive,
      staff_ids: selectedStaffIds,
    });
  };

  const displayError = localError || serverError;

  return (
    <div
      className="celeste-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-charcoal-green/45 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-service-modal-title"
    >
      <div className="celeste-card-elevated celeste-double-frame celeste-modal-panel relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-warm-terracotta/55">
        <div className="celeste-linen-surface relative flex items-center justify-between overflow-hidden border-b border-warm-terracotta/35 bg-warm-sand/55 px-6 py-4">
          <BohoCornerLeaf className="pointer-events-none absolute right-10 top-0 h-16 w-16 text-warm-terracotta/45" />
          <div className="relative">
            <BohoEyebrow>CELESTE</BohoEyebrow>
            <h2
              id="owner-service-modal-title"
              className="mt-0.5 font-serif text-2xl font-semibold text-charcoal-green"
            >
              {mode === 'edit' ? t('adminEditServiceTitle') : t('adminAddServiceTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeAction')}
            className="relative cursor-pointer rounded-xl border border-warm-terracotta/45 bg-white/80 p-1.5 text-charcoal-green/75 transition hover:bg-soft-sage"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="svc-category" className="block text-sm font-medium text-charcoal-green">
                {t('adminServiceCategoryLabel')}
              </label>
              <select
                id="svc-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={busy}
                className="celeste-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
              >
                {SERVICE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {labelCategory(cat)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="svc-name-en" className="block text-sm font-medium text-charcoal-green">
                {t('adminServiceNameEnLabel')}
              </label>
              <input
                id="svc-name-en"
                type="text"
                required
                maxLength={120}
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                disabled={busy}
                className="celeste-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="svc-name-gu" className="block text-sm font-medium text-charcoal-green">
                {t('adminServiceNameGuLabel')}
              </label>
              <input
                id="svc-name-gu"
                type="text"
                required
                maxLength={120}
                value={nameGu}
                onChange={(e) => setNameGu(e.target.value)}
                disabled={busy}
                className="celeste-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="svc-duration" className="block text-sm font-medium text-charcoal-green">
                {t('adminServiceDurationLabel')}
              </label>
              <input
                id="svc-duration"
                type="number"
                min={1}
                max={600}
                required
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                disabled={busy}
                className="celeste-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="svc-price" className="block text-sm font-medium text-charcoal-green">
                {t('adminServicePriceLabel')}
              </label>
              <input
                id="svc-price"
                type="number"
                min={0}
                max={500000}
                required
                value={priceInr}
                onChange={(e) => setPriceInr(e.target.value)}
                disabled={busy}
                className="celeste-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm tabular-nums"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-celeste-sage/30 bg-soft-sage/55 px-4 py-3 text-sm font-medium text-charcoal-green">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={busy}
              className="h-4 w-4 accent-deep-sage"
            />
            <span>{t('adminServiceActiveToggle')}</span>
          </label>

          <div>
            <p className="text-sm font-medium text-charcoal-green">{t('adminQualifiedStylistsLabel')}</p>
            <p className="mt-0.5 text-xs text-charcoal-green/70">{t('adminActiveServiceCoverageHint')}</p>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {staffList.map((member) => {
                const selected = selectedStaffIds.includes(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    disabled={busy}
                    onClick={() => toggleStaff(member.id)}
                    className={`celeste-selectable-card flex cursor-pointer items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs font-semibold ${
                      selected
                        ? 'border-deep-sage bg-soft-sage text-deep-sage ring-1 ring-celeste-sage/30'
                        : 'border-warm-terracotta/50 bg-warm-sand/35 text-charcoal-green/80 hover:bg-warm-sand/65'
                    }`}
                  >
                    <span>
                      {pick(member, 'name')}{' '}
                      <span className="font-normal text-charcoal-green/65">
                        ({pick(member, 'role')})
                      </span>
                    </span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-deep-sage" />}
                  </button>
                );
              })}
            </div>
          </div>

          {displayError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-muted-rose/45 bg-muted-rose/12 px-3.5 py-2.5 text-xs font-medium text-rosewood"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{displayError}</span>
            </div>
          )}

          <div className="flex justify-end gap-2.5 border-t border-champagne/55 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="celeste-btn-secondary cursor-pointer rounded-xl px-4 py-2.5 text-xs font-semibold"
            >
              {t('cancelAction')}
            </button>
            <button
              type="submit"
              disabled={busy}
              className="celeste-btn-primary cursor-pointer rounded-xl px-5 py-2.5 text-xs font-semibold"
            >
              {busy ? t('adminSaving') : t('saveChanges')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function StaffManageModal({
  open,
  staffMember = null,
  services = [],
  busy = false,
  serverError = '',
  onClose,
  onSaveProfile,
  onSaveQualifications,
}) {
  const { t, lang, pick, labelCategory } = useLanguage();

  const [slug, setSlug] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [nameGu, setNameGu] = useState('');
  const [roleEn, setRoleEn] = useState('');
  const [roleGu, setRoleGu] = useState('');
  const [specialityEn, setSpecialityEn] = useState('');
  const [specialityGu, setSpecialityGu] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    if (!open || !staffMember) return;
    setLocalError('');
    setSlug(staffMember.slug || '');
    setNameEn(staffMember.name_en || '');
    setNameGu(staffMember.name_gu || '');
    setRoleEn(staffMember.role_en || '');
    setRoleGu(staffMember.role_gu || '');
    setSpecialityEn(staffMember.speciality_en || '');
    setSpecialityGu(staffMember.speciality_gu || '');
    setSelectedServiceIds(staffMember.qualified_service_ids || []);
  }, [open, staffMember]);

  if (!open || !staffMember) return null;

  const toggleService = (serviceId) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
  };

  const handleSaveProfile = (event) => {
    event.preventDefault();
    setLocalError('');
    const normalizedSlug = slug.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(normalizedSlug)) {
      setLocalError(t('adminStaffSlugError'));
      return;
    }
    if (
      !nameEn.trim() ||
      !nameGu.trim() ||
      !roleEn.trim() ||
      !roleGu.trim() ||
      !specialityEn.trim() ||
      !specialityGu.trim()
    ) {
      setLocalError(t('adminStaffProfileRequiredError'));
      return;
    }

    onSaveProfile(staffMember.id, {
      slug: normalizedSlug,
      name_en: nameEn.trim(),
      name_gu: nameGu.trim(),
      role_en: roleEn.trim(),
      role_gu: roleGu.trim(),
      speciality_en: specialityEn.trim(),
      speciality_gu: specialityGu.trim(),
    });
  };

  const handleSaveQuals = () => {
    setLocalError('');
    onSaveQualifications(staffMember.id, selectedServiceIds);
  };

  const displayError = localError || serverError;

  return (
    <div
      className="celeste-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-charcoal-green/45 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="owner-staff-modal-title"
    >
      <div className="celeste-card-elevated celeste-double-frame celeste-modal-panel relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-warm-terracotta/55">
        <div className="celeste-linen-surface relative flex items-center justify-between overflow-hidden border-b border-warm-terracotta/35 bg-warm-sand/55 px-6 py-4">
          <BohoCornerLeaf className="pointer-events-none absolute right-10 top-0 h-16 w-16 text-warm-terracotta/45" />
          <div className="relative">
            <BohoEyebrow>CELESTE</BohoEyebrow>
            <h2
              id="owner-staff-modal-title"
              className="mt-0.5 font-serif text-2xl font-semibold text-charcoal-green"
            >
              {t('adminEditStaffTitle')} — {pick(staffMember, 'name')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('closeAction')}
            className="relative cursor-pointer rounded-xl border border-warm-terracotta/45 bg-white/80 p-1.5 text-charcoal-green/75 transition hover:bg-soft-sage"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {displayError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-muted-rose/45 bg-muted-rose/12 px-3.5 py-2.5 text-xs font-medium text-rosewood"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{displayError}</span>
            </div>
          )}

          {/* Profile Form */}
          <form onSubmit={handleSaveProfile} className="space-y-3.5 rounded-2xl border border-warm-terracotta/45 bg-warm-ivory/65 p-4">
            <h3 className="font-serif text-xl font-semibold text-charcoal-green">
              {t('adminStaffProfileHeading')}
            </h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="staff-slug" className="block text-xs font-semibold text-charcoal-green">
                  {t('adminStaffSlugLabel')}
                </label>
                <input
                  id="staff-slug"
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  disabled={busy}
                  className="celeste-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="staff-name-en" className="block text-xs font-semibold text-charcoal-green">
                  {t('adminNameEnLabel')}
                </label>
                <input
                  id="staff-name-en"
                  type="text"
                  required
                  value={nameEn}
                  onChange={(e) => setNameEn(e.target.value)}
                  disabled={busy}
                  className="celeste-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="staff-name-gu" className="block text-xs font-semibold text-charcoal-green">
                  {t('adminNameGuLabel')}
                </label>
                <input
                  id="staff-name-gu"
                  type="text"
                  required
                  value={nameGu}
                  onChange={(e) => setNameGu(e.target.value)}
                  disabled={busy}
                  className="celeste-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="staff-role-en" className="block text-xs font-semibold text-charcoal-green">
                  {t('adminRoleEnLabel')}
                </label>
                <input
                  id="staff-role-en"
                  type="text"
                  required
                  value={roleEn}
                  onChange={(e) => setRoleEn(e.target.value)}
                  disabled={busy}
                  className="celeste-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="staff-role-gu" className="block text-xs font-semibold text-charcoal-green">
                  {t('adminRoleGuLabel')}
                </label>
                <input
                  id="staff-role-gu"
                  type="text"
                  required
                  value={roleGu}
                  onChange={(e) => setRoleGu(e.target.value)}
                  disabled={busy}
                  className="celeste-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="staff-spec-en" className="block text-xs font-semibold text-charcoal-green">
                  {t('adminSpecialityEnLabel')}
                </label>
                <input
                  id="staff-spec-en"
                  type="text"
                  required
                  value={specialityEn}
                  onChange={(e) => setSpecialityEn(e.target.value)}
                  disabled={busy}
                  className="celeste-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="staff-spec-gu" className="block text-xs font-semibold text-charcoal-green">
                  {t('adminSpecialityGuLabel')}
                </label>
                <input
                  id="staff-spec-gu"
                  type="text"
                  required
                  value={specialityGu}
                  onChange={(e) => setSpecialityGu(e.target.value)}
                  disabled={busy}
                  className="celeste-input mt-1 w-full rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={busy}
                className="celeste-btn-primary cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold"
              >
                {busy ? t('adminSaving') : t('adminSaveProfileBtn')}
              </button>
            </div>
          </form>

          {/* Service Qualifications Selector */}
          <div className="space-y-3 rounded-2xl border border-celeste-sage/30 bg-soft-sage/45 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-serif text-xl font-semibold text-charcoal-green">
                  {t('adminManageQualificationsHeading')}
                </h3>
                <p className="text-xs text-charcoal-green/75">
                  {t('adminQualificationsCoverageNote')}
                </p>
              </div>
              <span className="rounded-full border border-celeste-sage/35 bg-white px-3 py-1 text-xs font-semibold tabular-nums text-deep-sage">
                {selectedServiceIds.length} / {services.length}
              </span>
            </div>

            <div className="space-y-3">
              {SERVICE_CATEGORIES.map((cat) => {
                const catServices = services.filter((s) => s.category === cat);
                if (catServices.length === 0) return null;
                return (
                  <div key={cat}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-rose">
                      {labelCategory(cat)}
                    </p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {catServices.map((svc) => {
                        const checked = selectedServiceIds.includes(svc.id);
                        return (
                          <button
                            key={svc.id}
                            type="button"
                            disabled={busy}
                            onClick={() => toggleService(svc.id)}
                            className={`celeste-selectable-card flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-left text-xs ${
                              checked
                                ? 'border-deep-sage bg-white font-semibold text-deep-sage'
                                : 'border-champagne/70 bg-warm-ivory/65 text-charcoal-green/75'
                            }`}
                          >
                            <span className="truncate pr-2">
                              {lang === 'gu' ? svc.name_gu : svc.name_en}
                              {!svc.is_active && (
                                <span className="ml-1 text-[10px] text-rosewood">
                                  ({t('adminInactiveLabel')})
                                </span>
                              )}
                            </span>
                            {checked && <Check className="h-3.5 w-3.5 shrink-0 text-deep-sage" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="celeste-btn-secondary cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold"
              >
                {t('closeAction')}
              </button>
              <button
                type="button"
                onClick={handleSaveQuals}
                disabled={busy}
                className="celeste-btn-primary cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold"
              >
                {busy ? t('adminSaving') : t('adminSaveQualificationsBtn')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DemoResetModal({ open, demoCount = 0, busy = false, serverError = '', onClose, onConfirm }) {
  const { t } = useLanguage();
  const [phrase, setPhrase] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhrase('');
    setAcknowledged(false);
  }, [open]);

  if (!open) return null;

  const canConfirm = acknowledged && phrase.trim().toUpperCase() === 'RESET DEMO DATA' && !busy;

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!canConfirm) return;
    onConfirm(phrase.trim().toUpperCase());
  };

  return (
    <div
      className="celeste-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-charcoal-green/45 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-reset-modal-title"
    >
      <div className="celeste-card-elevated celeste-double-frame celeste-modal-panel relative w-full max-w-md overflow-hidden rounded-3xl border border-muted-rose/55">
        <div className="celeste-linen-surface border-b border-warm-terracotta/40 bg-warm-sand/60 px-6 py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-rosewood">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <h2 id="demo-reset-modal-title" className="font-serif text-2xl font-semibold text-charcoal-green">
                {t('adminDemoResetTitle')}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('closeAction')}
              className="cursor-pointer rounded-xl border border-warm-terracotta/45 bg-white/80 p-1.5 text-charcoal-green/75"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <p className="text-sm leading-relaxed text-charcoal-green/85">
            {t('adminDemoResetDesc', { count: demoCount })}
          </p>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-warm-terracotta/55 bg-warm-sand/45 p-3 text-xs text-charcoal-green">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              disabled={busy}
              className="mt-0.5 h-4 w-4 accent-rosewood"
            />
            <span>{t('adminDemoResetCheckbox')}</span>
          </label>

          <div>
            <label htmlFor="demo-reset-phrase" className="block text-xs font-semibold text-charcoal-green">
              {t('adminDemoResetPhraseLabel')}
            </label>
            <input
              id="demo-reset-phrase"
              type="text"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="RESET DEMO DATA"
              disabled={busy}
              className="celeste-input mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm font-mono"
            />
          </div>

          {serverError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-muted-rose/45 bg-muted-rose/12 px-3.5 py-2.5 text-xs font-medium text-rosewood"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="celeste-btn-secondary cursor-pointer rounded-xl px-4 py-2.5 text-xs font-semibold"
            >
              {t('cancelAction')}
            </button>
            <button
              type="submit"
              disabled={!canConfirm}
              className="cursor-pointer rounded-xl bg-rosewood px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-rosewood/90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {busy ? t('adminResetting') : t('adminDemoResetBtn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
