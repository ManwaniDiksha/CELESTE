import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader.jsx';
import {
  BohoBotanicalSprig,
  BohoBranchRule,
  BohoCornerFlourish,
  BohoCornerLeaf,
  BohoEyebrow,
  BohoSunburstDivider,
} from '../components/BohoAccents.jsx';
import { PageError, PageLoading } from '../components/FeedbackStates.jsx';
import { RealtimeBanner } from '../components/RealtimeBanner.jsx';
import { StaffAvailabilityBadge, StaffAvatar } from '../components/StatusBadges.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useQueueRealtime } from '../hooks/useQueueRealtime.js';
import { getJoinOptions, joinQueue } from '../services/api.js';
import {
  formatInr,
  formatMinutes,
  isValidTenDigitPhone,
  previewAnyAvailableStylist,
  sanitizePhoneDigits,
} from '../utils/formatters.js';

export default function JoinQueuePage() {
  const { t, lang, pick, labelCategory } = useLanguage();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [selectionMode, setSelectionMode] = useState('any_available');
  const [preferredStaffId, setPreferredStaffId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [appliedInitialQuery, setAppliedInitialQuery] = useState(false);

  const loadOptions = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setLoadError('');
    try {
      const res = await getJoinOptions();
      setOptions(res.data);
    } catch (err) {
      setLoadError(err.message || 'Unable to load queue options.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    if (!options || appliedInitialQuery) return;
    const staffParam = searchParams.get('staff');
    const categoryParam = searchParams.get('category');

    if (
      staffParam &&
      options.staff?.some(
        (s) => s.id === staffParam && s.is_on_duty && s.availability_status !== 'On Break'
      )
    ) {
      setSelectionMode('specific');
      setPreferredStaffId(staffParam);
    }
    if (categoryParam && options.categories?.[categoryParam]) {
      setActiveCategory(categoryParam);
    }
    setAppliedInitialQuery(true);
  }, [options, appliedInitialQuery, searchParams]);

  const realtime = useQueueRealtime(() => loadOptions({ silent: true }), { enabled: true });

  const salon = options?.salon || {};
  const maxServices = salon.max_services_per_entry || 3;
  const allServices = options?.services || [];
  const categories = options?.categories || {};
  const staffList = options?.staff || [];

  const serviceById = useMemo(
    () => new Map(allServices.map((svc) => [svc.id, svc])),
    [allServices]
  );

  useEffect(() => {
    if (!options) return;
    setSelectedServiceIds((prev) => prev.filter((id) => serviceById.has(id)));
  }, [options, serviceById]);

  const selectedServices = useMemo(
    () => selectedServiceIds.map((id) => serviceById.get(id)).filter(Boolean),
    [selectedServiceIds, serviceById]
  );

  const totals = useMemo(() => {
    let duration = 0;
    let price = 0;
    for (const svc of selectedServices) {
      duration += Number(svc.duration_minutes) || 0;
      price += Number(svc.price_inr) || 0;
    }
    return { duration, price };
  }, [selectedServices]);

  const staffEligibility = useMemo(() => {
    const map = new Map();
    for (const member of staffList) {
      const qualSet = new Set(member.qualified_service_ids || []);
      const qualifiedForAll =
        selectedServiceIds.length === 0 || selectedServiceIds.every((id) => qualSet.has(id));
      const availableForNew = Boolean(member.is_on_duty) && member.availability_status !== 'On Break';
      map.set(member.id, {
        qualifiedForAll,
        availableForNew,
        selectable: qualifiedForAll && availableForNew,
      });
    }
    return map;
  }, [staffList, selectedServiceIds]);

  useEffect(() => {
    if (selectionMode !== 'specific' || !preferredStaffId) return;
    const status = staffEligibility.get(preferredStaffId);
    if (status && !status.selectable) {
      setPreferredStaffId('');
    }
  }, [selectionMode, preferredStaffId, staffEligibility]);

  const anyAvailablePreview = useMemo(
    () => previewAnyAvailableStylist(staffList, selectedServiceIds),
    [staffList, selectedServiceIds]
  );

  const selectedSpecificStaff = useMemo(
    () => staffList.find((s) => s.id === preferredStaffId) || null,
    [staffList, preferredStaffId]
  );

  const toggleService = (serviceId) => {
    setSubmitError('');
    setSelectedServiceIds((prev) => {
      if (prev.includes(serviceId)) {
        return prev.filter((id) => id !== serviceId);
      }
      if (prev.length >= maxServices) {
        return prev;
      }
      return [...prev, serviceId];
    });
  };

  const categoryKeys = Object.keys(categories);
  const visibleServices =
    activeCategory === 'ALL' ? allServices : categories[activeCategory] || [];

  const phoneDigitsValid = isValidTenDigitPhone(phone);
  const trimmedNameValid = name.trim().length >= 1 && name.trim().length <= 120;
  const hasAnyEligibleStylist =
    selectedServiceIds.length === 0 ||
    Array.from(staffEligibility.values()).some((item) => item.selectable);

  const staffSelectionValid =
    selectedServiceIds.length > 0 &&
    hasAnyEligibleStylist &&
    (selectionMode === 'any_available'
      ? anyAvailablePreview.hasEligibleStaff
      : Boolean(preferredStaffId && staffEligibility.get(preferredStaffId)?.selectable));

  const canSubmit =
    Boolean(salon.can_join_online) &&
    trimmedNameValid &&
    phoneDigitsValid &&
    selectedServiceIds.length >= 1 &&
    selectedServiceIds.length <= maxServices &&
    staffSelectionValid &&
    !submitting;

  const blockedMessage = (() => {
    if (salon.can_join_online) return null;
    switch (salon.online_blocked_reason) {
      case 'SALON_CLOSED':
        return t('joinBlockedClosed');
      case 'ONLINE_QUEUE_CLOSED':
        return t('joinBlockedManual');
      case 'ONLINE_CUTOFF_PASSED':
        return t('joinBlockedCutoff');
      case 'ONLINE_CAPACITY_FULL':
        return t('joinBlockedCapacity');
      default:
        return t('joinBlockedManual');
    }
  })();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setSubmitError('');

    try {
      const payload = {
        name: name.trim(),
        phone,
        serviceIds: selectedServiceIds,
        selectionMode,
        ...(selectionMode === 'specific' ? { preferredStaffId } : {}),
      };
      const res = await joinQueue(payload);
      const entryId = res?.data?.entry_id;
      try {
        if (entryId) {
          window.localStorage.setItem('celeste_last_ticket_id', entryId);
        }
      } catch {
        // Ignore storage write errors.
      }
      navigate(`/status/${entryId}`, { state: { justJoined: true } });
    } catch (err) {
      setSubmitError(err.message || 'Unable to join the queue right now.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !options) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageLoading />
      </div>
    );
  }

  if (loadError && !options) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageError message={loadError} onRetry={() => loadOptions()} />
      </div>
    );
  }

  const estimatedWaitPreview =
    selectionMode === 'any_available'
      ? anyAvailablePreview.estimatedWaitMinutes
      : selectedSpecificStaff?.workload_minutes ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-warm-ivory text-charcoal-green">
      <AppHeader salonName={salon.name || 'CELESTE'} />
      <RealtimeBanner status={realtime.status} onReconnect={realtime.reconnect} />

      {/* Warm Sand Title Strip with Botanical Line Accent */}
      <div className="celeste-linen-surface relative overflow-hidden border-b border-warm-terracotta/50 bg-warm-sand/50">
        <BohoCornerLeaf className="pointer-events-none absolute right-4 top-0 hidden h-28 w-28 text-warm-terracotta/60 sm:block" />
        <div className="relative mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <Link
              to="/"
              className="group inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-rose transition hover:text-deep-sage"
            >
              <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" aria-hidden="true" />
              <span>{t('navHome')}</span>
            </Link>
            <div className="mt-2">
              <BohoEyebrow>{t('joinEyebrow')}</BohoEyebrow>
            </div>
            <h1 className="mt-1 font-serif text-3xl font-semibold text-charcoal-green sm:text-4xl">
              {t('joinHeading')}
            </h1>
            <p className="mt-1 text-sm text-charcoal-green/80 sm:text-base">{t('joinSub')}</p>
            <BohoSunburstDivider className="mt-3" />
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-warm-terracotta/70 bg-[#FDFBF7] px-4 py-2.5 text-xs font-medium shadow-2xs">
            <span className="text-charcoal-green/70">{t('homeOnlineSlots')}:</span>
            <span className="font-semibold tabular-nums text-deep-sage">
              {salon.remaining_online_slots ?? 0} / {salon.daily_online_capacity ?? 30}
            </span>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {blockedMessage && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-2xl border border-muted-rose/45 bg-muted-rose/12 p-4 text-sm text-rosewood"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="font-medium">{blockedMessage}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid gap-8 lg:grid-cols-12 lg:items-start">
          {/* Left Column: Customer Info, Services, Stylist Selection */}
          <div className="space-y-8 lg:col-span-8">
            {/* Step 1: Customer Details */}
            <section className="celeste-card rounded-3xl border border-warm-terracotta/50 p-6 sm:p-7">
              <div className="flex items-center gap-2 border-b border-warm-terracotta/30 pb-3">
                <BohoBotanicalSprig className="h-4 w-4 text-celeste-sage" />
                <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
                  {t('joinCustomerHeading')}
                </h2>
              </div>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="join-name"
                    className="block text-sm font-medium text-charcoal-green"
                  >
                    {t('joinNameLabel')} <span className="text-muted-rose">*</span>
                  </label>
                  <input
                    id="join-name"
                    type="text"
                    required
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('joinNamePlaceholder')}
                    className="celeste-input mt-1.5 w-full rounded-xl px-4 py-3 text-sm placeholder:text-charcoal-green/45"
                  />
                </div>

                <div>
                  <label
                    htmlFor="join-phone"
                    className="block text-sm font-medium text-charcoal-green"
                  >
                    {t('joinPhoneLabel')} <span className="text-muted-rose">*</span>
                  </label>
                  <input
                    id="join-phone"
                    type="tel"
                    inputMode="numeric"
                    required
                    maxLength={10}
                    value={phone}
                    onChange={(e) => setPhone(sanitizePhoneDigits(e.target.value))}
                    placeholder={t('joinPhonePlaceholder')}
                    className="celeste-input mt-1.5 w-full rounded-xl px-4 py-3 text-sm tabular-nums placeholder:text-charcoal-green/45"
                  />
                  {phone.length > 0 && !phoneDigitsValid ? (
                    <p className="celeste-animate-in mt-1 text-xs font-medium text-muted-rose">
                      {lang === 'gu'
                        ? 'ફોન નંબર બરાબર ૧૦ અંકોનો હોવો જોઈએ.'
                        : 'Please enter an exact 10-digit phone number.'}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-charcoal-green/60">{t('joinPhoneHint')}</p>
                  )}
                </div>
              </div>
            </section>

            {/* Step 2: Services */}
            <section className="celeste-card rounded-3xl border border-warm-terracotta/50 p-6 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warm-terracotta/30 pb-3">
                <div className="flex items-center gap-2">
                  <BohoBotanicalSprig className="h-4 w-4 text-celeste-sage" />
                  <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
                    {t('joinServicesHeading')}
                  </h2>
                </div>
                <span className="rounded-full border border-muted-rose/35 bg-muted-rose/10 px-3.5 py-1 text-xs font-semibold text-muted-rose">
                  {t('joinSelectedCount', {
                    count: selectedServiceIds.length,
                    max: maxServices,
                  })}
                </span>
              </div>

              {selectedServices.length > 0 && (
                <div className="celeste-animate-in mt-4 flex flex-wrap gap-2">
                  {selectedServices.map((svc) => (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => toggleService(svc.id)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-warm-terracotta bg-soft-sage px-3.5 py-1.5 text-xs font-semibold text-deep-sage transition hover:bg-warm-sand active:scale-95"
                    >
                      <span>{pick(svc, 'name')}</span>
                      <X className="h-3.5 w-3.5 text-muted-rose" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}

              {/* Category Filter Tabs */}
              <div className="mt-5 flex flex-wrap gap-2 border-b border-champagne/45 pb-4">
                <button
                  type="button"
                  onClick={() => setActiveCategory('ALL')}
                  className={`cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-semibold transition active:scale-[0.98] ${
                    activeCategory === 'ALL'
                      ? 'border-deep-sage bg-deep-sage text-warm-ivory shadow-2xs'
                      : 'border-warm-terracotta/45 bg-warm-sand/40 text-charcoal-green/85 hover:bg-soft-sage'
                  }`}
                >
                  {lang === 'gu' ? 'બધી શ્રેણીઓ' : 'All Categories'} ({allServices.length})
                </button>
                {categoryKeys.map((catKey) => (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => setActiveCategory(catKey)}
                    className={`cursor-pointer rounded-xl border px-3.5 py-2 text-xs font-semibold transition active:scale-[0.98] ${
                      activeCategory === catKey
                        ? 'border-deep-sage bg-deep-sage text-warm-ivory shadow-2xs'
                        : 'border-warm-terracotta/45 bg-warm-sand/40 text-charcoal-green/85 hover:bg-soft-sage'
                    }`}
                  >
                    {labelCategory(catKey)} ({categories[catKey]?.length || 0})
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {visibleServices.map((svc) => {
                  const isSelected = selectedServiceIds.includes(svc.id);
                  const limitReached = !isSelected && selectedServiceIds.length >= maxServices;

                  return (
                    <button
                      key={svc.id}
                      type="button"
                      disabled={limitReached}
                      onClick={() => toggleService(svc.id)}
                      aria-pressed={isSelected}
                      className={`celeste-selectable-card flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-4 text-left ${
                        isSelected
                          ? 'border-celeste-sage bg-soft-sage/90 shadow-xs ring-2 ring-warm-terracotta/70'
                          : limitReached
                            ? 'cursor-not-allowed border-champagne/35 bg-warm-ivory/40 opacity-45'
                            : 'border-champagne/70 bg-white hover:bg-warm-sand/30'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-charcoal-green">
                          {pick(svc, 'name')}
                        </p>
                        <p className="mt-1 flex items-center gap-2 text-xs text-charcoal-green/75 tabular-nums">
                          <span>{formatMinutes(svc.duration_minutes, lang)}</span>
                          <span className="text-warm-terracotta">·</span>
                          <span className="font-semibold text-deep-sage">
                            {formatInr(svc.price_inr)}
                          </span>
                        </p>
                      </div>

                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${
                          isSelected
                            ? 'border-deep-sage bg-deep-sage text-warm-ivory'
                            : 'border-warm-terracotta/70 bg-warm-ivory text-transparent'
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Step 3: Staff Selection */}
            <section className="celeste-card rounded-3xl border border-warm-terracotta/50 p-6 sm:p-7">
              <div className="flex items-center gap-2 border-b border-warm-terracotta/30 pb-3">
                <BohoBotanicalSprig className="h-4 w-4 text-celeste-sage" />
                <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
                  {t('joinStaffHeading')}
                </h2>
              </div>

              {selectedServiceIds.length === 0 && (
                <p className="mt-3 text-xs font-medium text-dusty-blue">
                  {t('joinSelectServicesFirst')}
                </p>
              )}

              {selectedServiceIds.length > 0 && !hasAnyEligibleStylist && (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-muted-rose/45 bg-muted-rose/12 px-4 py-3 text-sm text-rosewood"
                >
                  {t('joinNoEligibleForCombo')}
                </div>
              )}

              {/* Any Available Stylist */}
              <button
                type="button"
                disabled={selectedServiceIds.length > 0 && !anyAvailablePreview.hasEligibleStaff}
                onClick={() => {
                  setSelectionMode('any_available');
                  setPreferredStaffId('');
                }}
                className={`celeste-selectable-card mt-5 flex w-full cursor-pointer items-center justify-between gap-4 rounded-2xl border p-4 text-left ${
                  selectionMode === 'any_available'
                    ? 'border-celeste-sage bg-soft-sage/90 shadow-xs ring-2 ring-warm-terracotta/70'
                    : 'border-warm-terracotta/60 bg-warm-sand/35 hover:bg-white'
                } disabled:cursor-not-allowed disabled:opacity-55`}
              >
                <div className="flex items-start gap-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-warm-terracotta/70 bg-deep-sage text-warm-terracotta">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-charcoal-green">
                      {t('joinAnyStylistTitle')}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-charcoal-green/75">
                      {t('joinAnyStylistDesc')}
                    </p>
                    {selectedServiceIds.length > 0 && anyAvailablePreview.projectedStaff && (
                      <p className="mt-1.5 text-xs font-semibold text-deep-sage">
                        {lang === 'gu'
                          ? `અંદાજિત ફાળવણી: ${pick(anyAvailablePreview.projectedStaff, 'name')}`
                          : `Current lightest match: ${pick(anyAvailablePreview.projectedStaff, 'name')}`}
                      </p>
                    )}
                  </div>
                </div>
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                    selectionMode === 'any_available'
                      ? 'border-deep-sage bg-deep-sage text-warm-ivory'
                      : 'border-warm-terracotta/70 bg-white text-transparent'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
              </button>

              {/* Individual Staff Cards */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {staffList.map((member) => {
                  const elig = staffEligibility.get(member.id) || {
                    qualifiedForAll: true,
                    availableForNew: true,
                    selectable: true,
                  };
                  const isChosen =
                    selectionMode === 'specific' && preferredStaffId === member.id;

                  return (
                    <button
                      key={member.id}
                      type="button"
                      disabled={!elig.selectable}
                      onClick={() => {
                        setSelectionMode('specific');
                        setPreferredStaffId(member.id);
                      }}
                      className={`celeste-selectable-card flex cursor-pointer flex-col justify-between gap-3 rounded-2xl border p-4 text-left ${
                        isChosen
                          ? 'border-celeste-sage bg-soft-sage/90 shadow-xs ring-2 ring-warm-terracotta/70'
                          : !elig.selectable
                            ? 'cursor-not-allowed border-champagne/40 bg-warm-ivory/40 opacity-50'
                            : 'border-champagne/70 bg-white'
                      }`}
                    >
                      <div className="flex w-full items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <StaffAvatar staff={member} size="md" />
                          <div>
                            <p className="font-serif text-xl font-semibold text-charcoal-green">
                              {pick(member, 'name')}
                            </p>
                            <p className="text-xs font-medium text-muted-rose">
                              {pick(member, 'role')}
                            </p>
                          </div>
                        </div>

                        <StaffAvailabilityBadge
                          availabilityStatus={member.availability_status}
                          isOnDuty={member.is_on_duty}
                        />
                      </div>

                      <div className="flex w-full items-center justify-between border-t border-warm-terracotta/30 pt-2.5 text-xs">
                        {!elig.qualifiedForAll ? (
                          <span className="font-medium text-rosewood">
                            {t('joinStylistIneligible')}
                          </span>
                        ) : !elig.availableForNew ? (
                          <span className="font-medium text-rosewood">
                            {t('joinStylistUnavailable')}
                          </span>
                        ) : (
                          <span className="text-charcoal-green/75 tabular-nums">
                            {member.waiting_count ?? 0} {t('waitingSuffix')} ·{' '}
                            {member.workload_minutes === null
                              ? '—'
                              : formatMinutes(member.workload_minutes, lang)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

          {/* Right Column: Sticky Booking Summary */}
          <aside className="lg:sticky lg:top-24 lg:col-span-4">
            <div className="celeste-card-elevated celeste-double-frame overflow-hidden rounded-3xl border border-warm-terracotta/65">
              <div className="celeste-linen-sage relative flex items-center justify-between overflow-hidden bg-deep-sage px-6 py-4 text-warm-ivory">
                <BohoCornerLeaf className="pointer-events-none absolute right-10 top-0 h-16 w-16 text-warm-terracotta/35" />
                <h2 className="relative font-serif text-2xl font-semibold text-white">
                  {t('joinSummaryHeading')}
                </h2>
                <UserCheck className="relative h-5 w-5 text-warm-terracotta" aria-hidden="true" />
              </div>

              <div className="relative p-6">
                <BohoCornerFlourish className="pointer-events-none absolute bottom-3 left-3 h-7 w-7 rotate-270 text-warm-terracotta/45" />
                {selectedServices.length === 0 ? (
                  <p className="py-5 text-sm text-charcoal-green/65">{t('joinSummaryEmpty')}</p>
                ) : (
                  <ul className="divide-y divide-warm-terracotta/25">
                    {selectedServices.map((svc) => (
                      <li
                        key={svc.id}
                        className="celeste-animate-in flex items-center justify-between gap-2 py-2.5 text-sm"
                      >
                        <span className="font-medium text-charcoal-green">{pick(svc, 'name')}</span>
                        <span className="shrink-0 tabular-nums text-charcoal-green/80">
                          {formatMinutes(svc.duration_minutes, lang)} ·{' '}
                          <strong className="text-deep-sage">{formatInr(svc.price_inr)}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                <BohoBranchRule className="mt-4" />

                <dl className="mt-4 space-y-2.5 rounded-2xl border border-warm-terracotta/50 bg-warm-sand/55 p-4 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-charcoal-green/75">{t('joinSummaryDuration')}</dt>
                    <dd className="font-semibold tabular-nums text-charcoal-green">
                      {formatMinutes(totals.duration, lang)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-charcoal-green/75">{t('joinSummaryPrice')}</dt>
                    <dd className="font-serif text-xl font-bold tabular-nums text-deep-sage">
                      {formatInr(totals.price)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-warm-terracotta/30 pt-2">
                    <dt className="text-charcoal-green/75">{t('joinSummaryStylist')}</dt>
                    <dd className="font-semibold text-charcoal-green">
                      {selectionMode === 'any_available'
                        ? anyAvailablePreview.projectedStaff
                          ? `${t('joinAnyStylistTitle')} (${pick(
                              anyAvailablePreview.projectedStaff,
                              'name'
                            )})`
                          : t('joinAnyStylistTitle')
                        : selectedSpecificStaff
                          ? pick(selectedSpecificStaff, 'name')
                          : '—'}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-1.5 text-charcoal-green/75">
                      <Clock className="h-3.5 w-3.5 text-deep-sage" aria-hidden="true" />
                      <span>{t('joinSummaryWait')}</span>
                    </dt>
                    <dd className="font-semibold tabular-nums text-deep-sage">
                      {estimatedWaitPreview === null
                        ? '—'
                        : estimatedWaitPreview === 0
                          ? lang === 'gu'
                            ? 'તૈયાર'
                            : 'No wait'
                          : formatMinutes(estimatedWaitPreview, lang)}
                    </dd>
                  </div>
                </dl>

                {submitError && (
                  <div
                    role="alert"
                    className="mt-4 flex items-start gap-2 rounded-xl border border-muted-rose/45 bg-muted-rose/12 p-3 text-xs font-medium text-rosewood"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{submitError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="celeste-btn-primary mt-6 w-full cursor-pointer rounded-xl px-5 py-3.5 text-sm font-semibold"
                >
                  {submitting ? t('joinSubmitting') : t('joinConfirmBtn')}
                </button>
              </div>
            </div>
          </aside>
        </form>
      </main>
    </div>
  );
}
