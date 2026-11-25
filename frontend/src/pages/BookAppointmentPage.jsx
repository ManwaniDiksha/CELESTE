import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Search,
  Sparkles,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader.jsx';
import {
  BohoCornerLeaf,
  BohoEyebrow,
  BohoSunburstDivider,
} from '../components/BohoAccents.jsx';
import { ConfirmModal } from '../components/ConfirmModal.jsx';
import { PageError, PageLoading } from '../components/FeedbackStates.jsx';
import { StaffAvatar } from '../components/StatusBadges.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import {
  bookAppointment,
  cancelCustomerAppointment,
  getAppointmentSlots,
  getJoinOptions,
  lookupAppointment,
} from '../services/api.js';
import {
  formatDateLabel,
  formatInr,
  formatMinutes,
  formatTimeHhMm,
  isValidTenDigitPhone,
  sanitizePhoneDigits,
} from '../utils/formatters.js';

function getTodayIstString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts;
}

export default function BookAppointmentPage() {
  const { t, lang, pick, pickSnapshotName, labelCategory } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'lookup' ? 'lookup' : 'book';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Booking form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [appointmentDate, setAppointmentDate] = useState(() => getTodayIstString());
  const [selectionMode, setSelectionMode] = useState('any_available');
  const [preferredStaffId, setPreferredStaffId] = useState(null);
  const [selectedStartTime, setSelectedStartTime] = useState('');

  // Slots state
  const [slotsData, setSlotsData] = useState(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmedAppt, setConfirmedAppt] = useState(null);

  // Lookup state
  const [lookupRef, setLookupRef] = useState('');
  const [lookupPhone, setLookupPhone] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getJoinOptions();
      setCatalog(res.data);
    } catch (err) {
      setError(err.message || 'Unable to load salon services.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const services = catalog?.services || [];
  const categories = catalog?.categories || {};
  const staffList = catalog?.staff || [];
  const maxServices = catalog?.salon?.max_services_per_entry || 3;

  const selectedServices = useMemo(
    () => selectedServiceIds.map((id) => services.find((s) => s.id === id)).filter(Boolean),
    [selectedServiceIds, services]
  );

  const totalDuration = selectedServices.reduce((sum, s) => sum + Number(s.duration_minutes || 0), 0);
  const totalPrice = selectedServices.reduce((sum, s) => sum + Number(s.price_inr || 0), 0);

  const qualifiedStaff = useMemo(() => {
    if (selectedServiceIds.length === 0) return staffList;
    return staffList.filter((m) => {
      const q = new Set(m.qualified_service_ids || []);
      return selectedServiceIds.every((id) => q.has(id));
    });
  }, [staffList, selectedServiceIds]);

  useEffect(() => {
    if (
      selectionMode === 'specific' &&
      preferredStaffId &&
      !qualifiedStaff.some((m) => m.id === preferredStaffId)
    ) {
      setPreferredStaffId(null);
      setSelectionMode('any_available');
    }
  }, [qualifiedStaff, preferredStaffId, selectionMode]);

  useEffect(() => {
    if (!appointmentDate || selectedServiceIds.length === 0) {
      setSlotsData(null);
      setSelectedStartTime('');
      return;
    }

    let active = true;
    setSlotsLoading(true);
    setSlotsError('');
    getAppointmentSlots({
      date: appointmentDate,
      serviceIds: selectedServiceIds,
      preferredStaffId: selectionMode === 'specific' ? preferredStaffId : null,
    })
      .then((res) => {
        if (!active) return;
        setSlotsData(res.data);
        const stillValid = (res.data?.slots || []).some((s) => s.start_time === selectedStartTime);
        if (!stillValid) setSelectedStartTime('');
      })
      .catch((err) => {
        if (!active) return;
        setSlotsError(err.message || 'Unable to load available time slots.');
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [appointmentDate, selectedServiceIds, selectionMode, preferredStaffId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleService = (id) => {
    setSubmitError('');
    setSelectedServiceIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxServices) return prev;
      return [...prev, id];
    });
  };

  const canSubmit =
    name.trim().length > 0 &&
    isValidTenDigitPhone(phone) &&
    selectedServiceIds.length >= 1 &&
    Boolean(appointmentDate) &&
    Boolean(selectedStartTime) &&
    (selectionMode === 'any_available' || Boolean(preferredStaffId)) &&
    !submitting;

  const handleBookSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await bookAppointment({
        name: name.trim(),
        phone: phone.trim(),
        appointmentDate,
        startTime: selectedStartTime,
        serviceIds: selectedServiceIds,
        selectionMode,
        preferredStaffId: selectionMode === 'specific' ? preferredStaffId : null,
      });
      setConfirmedAppt({
        ...res.data,
        customer_name: name.trim(),
        phone: phone.trim(),
        services: selectedServices,
        assigned_staff: staffList.find((m) => m.id === res.data.assigned_staff_id) || null,
      });
    } catch (err) {
      setSubmitError(err.message || 'Unable to confirm appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLookupSubmit = async (e) => {
    e.preventDefault();
    setLookupError('');
    setLookupResult(null);
    if (!lookupRef.trim() || !isValidTenDigitPhone(lookupPhone)) {
      setLookupError(t('apptLookupDesc'));
      return;
    }
    setLookupLoading(true);
    try {
      const res = await lookupAppointment({
        reference: lookupRef.trim().toUpperCase(),
        phone: lookupPhone.trim(),
      });
      setLookupResult(res.data);
    } catch (err) {
      setLookupError(err.message || 'Appointment not found.');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!lookupResult) return;
    setCancelBusy(true);
    try {
      await cancelCustomerAppointment(lookupResult.appointment_id, lookupPhone.trim());
      setCancelModalOpen(false);
      const refreshed = await lookupAppointment({
        reference: lookupResult.reference_code,
        phone: lookupPhone.trim(),
      });
      setLookupResult(refreshed.data);
    } catch (err) {
      setLookupError(err.message || 'Unable to cancel appointment.');
      setCancelModalOpen(false);
    } finally {
      setCancelBusy(false);
    }
  };

  if (loading && !catalog) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageLoading />
      </div>
    );
  }

  if (error && !catalog) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageError message={error} onRetry={loadCatalog} />
      </div>
    );
  }

  const todayIst = getTodayIstString();

  return (
    <div className="flex min-h-screen flex-col bg-warm-ivory text-charcoal-green">
      <AppHeader salonName={catalog?.salon?.name || 'CELESTE'} />

      <div className="celeste-linen-surface relative overflow-hidden border-b border-warm-terracotta/50 bg-warm-sand/50">
        <BohoCornerLeaf className="pointer-events-none absolute right-4 top-0 hidden h-28 w-28 text-warm-terracotta/55 sm:block" />
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
              <BohoEyebrow>{t('apptPageEyebrow')}</BohoEyebrow>
            </div>
            <h1 className="mt-1 font-serif text-3xl font-semibold text-charcoal-green sm:text-4xl">
              {t('apptPageHeading')}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-charcoal-green/80 sm:text-base">
              {t('apptPageSub')}
            </p>
            <BohoSunburstDivider className="mt-3" />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('book');
                setSearchParams({});
              }}
              className={`cursor-pointer rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                activeTab === 'book'
                  ? 'border-deep-sage bg-deep-sage text-warm-ivory shadow-xs'
                  : 'border-warm-terracotta/60 bg-white text-charcoal-green hover:bg-soft-sage'
              }`}
            >
              {t('apptTabBook')}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('lookup');
                setSearchParams({ tab: 'lookup' });
              }}
              className={`cursor-pointer rounded-xl border px-4 py-2 text-xs font-semibold transition ${
                activeTab === 'lookup'
                  ? 'border-deep-sage bg-deep-sage text-warm-ivory shadow-xs'
                  : 'border-warm-terracotta/60 bg-white text-charcoal-green hover:bg-soft-sage'
              }`}
            >
              {t('apptTabLookup')}
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {activeTab === 'book' ? (
          confirmedAppt ? (
            <section className="celeste-card-elevated celeste-double-frame mx-auto max-w-2xl rounded-3xl border border-celeste-sage/35 p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-soft-sage text-deep-sage">
                  <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <BohoEyebrow>{t('apptConfirmedHeading')}</BohoEyebrow>
                  <h2 className="font-serif text-3xl font-semibold text-charcoal-green">
                    {confirmedAppt.reference_code}
                  </h2>
                </div>
              </div>

              <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-warm-terracotta/45 bg-warm-sand/45 p-4">
                  <dt className="text-xs font-medium text-charcoal-green/70">{t('apptDateTimeLabel')}</dt>
                  <dd className="mt-1 font-semibold text-charcoal-green">
                    {formatDateLabel(confirmedAppt.appointment_date, lang)} ·{' '}
                    {formatTimeHhMm(confirmedAppt.start_time, lang)}
                  </dd>
                </div>
                <div className="rounded-2xl border border-celeste-sage/25 bg-soft-sage/65 p-4">
                  <dt className="text-xs font-medium text-deep-sage">{t('joinSummaryStylist')}</dt>
                  <dd className="mt-1 font-semibold text-charcoal-green">
                    {pick(confirmedAppt.assigned_staff, 'name')}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 rounded-2xl border border-warm-terracotta/40 bg-warm-ivory p-4 text-sm">
                <p className="font-semibold text-charcoal-green">{t('statusServicesSelected')}</p>
                <ul className="mt-2 space-y-1">
                  {(confirmedAppt.services || []).map((svc) => (
                    <li key={svc.id} className="flex justify-between">
                      <span>{pick(svc, 'name')}</span>
                      <span className="tabular-nums text-deep-sage">
                        {formatMinutes(svc.duration_minutes, lang)} · {formatInr(svc.price_inr)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="mt-4 rounded-xl border border-champagne/60 bg-warm-sand/40 px-4 py-3 text-xs text-charcoal-green/80">
                {t('apptNotifNote')}
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setLookupRef(confirmedAppt.reference_code);
                    setLookupPhone(confirmedAppt.phone);
                    setConfirmedAppt(null);
                    setActiveTab('lookup');
                  }}
                  className="celeste-btn-primary cursor-pointer rounded-xl px-5 py-2.5 text-sm font-semibold"
                >
                  {t('apptTabLookup')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmedAppt(null);
                    setSelectedStartTime('');
                  }}
                  className="celeste-btn-secondary cursor-pointer rounded-xl px-5 py-2.5 text-sm font-semibold"
                >
                  {t('apptTabBook')}
                </button>
              </div>
            </section>
          ) : (
            <form onSubmit={handleBookSubmit} className="grid gap-8 lg:grid-cols-12">
              <div className="space-y-6 lg:col-span-8">
                {/* 1. Customer details */}
                <section className="celeste-card rounded-3xl border border-warm-terracotta/55 p-6">
                  <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
                    {t('joinCustomerHeading')}
                  </h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="appt-name" className="block text-sm font-medium text-charcoal-green">
                        {t('joinNameLabel')} *
                      </label>
                      <input
                        id="appt-name"
                        type="text"
                        required
                        maxLength={120}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t('joinNamePlaceholder')}
                        className="celeste-input mt-1.5 w-full rounded-xl px-4 py-3 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="appt-phone" className="block text-sm font-medium text-charcoal-green">
                        {t('joinPhoneLabel')} *
                      </label>
                      <input
                        id="appt-phone"
                        type="tel"
                        inputMode="numeric"
                        required
                        value={phone}
                        onChange={(e) => setPhone(sanitizePhoneDigits(e.target.value))}
                        placeholder={t('joinPhonePlaceholder')}
                        className="celeste-input mt-1.5 w-full rounded-xl px-4 py-3 text-sm tabular-nums"
                      />
                    </div>
                  </div>
                </section>

                {/* 2. Services (max 3) */}
                <section className="celeste-card rounded-3xl border border-warm-terracotta/55 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
                      {t('joinServicesHeading')}
                    </h2>
                    <span className="rounded-full bg-soft-sage px-3 py-1 text-xs font-semibold text-deep-sage">
                      {t('joinSelectedCount', { count: selectedServiceIds.length, max: maxServices })}
                    </span>
                  </div>

                  <div className="mt-5 space-y-5">
                    {Object.entries(categories).map(([catKey, items]) => (
                      <div key={catKey}>
                        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-rose">
                          {labelCategory(catKey)}
                        </h3>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          {items.map((svc) => {
                            const selected = selectedServiceIds.includes(svc.id);
                            const disabled = !selected && selectedServiceIds.length >= maxServices;
                            return (
                              <button
                                key={svc.id}
                                type="button"
                                disabled={disabled}
                                onClick={() => toggleService(svc.id)}
                                className={`celeste-selectable-card flex cursor-pointer items-center justify-between gap-3 rounded-2xl border p-3.5 text-left ${
                                  selected
                                    ? 'border-deep-sage bg-soft-sage/85 ring-1 ring-celeste-sage/30'
                                    : 'border-warm-terracotta/45 bg-white hover:border-celeste-sage/50 disabled:cursor-not-allowed disabled:opacity-45'
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className="font-semibold text-charcoal-green">{pick(svc, 'name')}</p>
                                  <p className="mt-0.5 text-xs tabular-nums text-charcoal-green/70">
                                    {formatMinutes(svc.duration_minutes, lang)} ·{' '}
                                    <strong className="text-deep-sage">{formatInr(svc.price_inr)}</strong>
                                  </p>
                                </div>
                                {selected && (
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-deep-sage text-white">
                                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* 3. Date, Stylist & Available Slots */}
                <section className="celeste-card rounded-3xl border border-warm-terracotta/55 p-6 space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="appt-date" className="block text-sm font-medium text-charcoal-green">
                        <Calendar className="mr-1.5 inline h-4 w-4 text-celeste-sage" aria-hidden="true" />
                        {t('apptDateLabel')} *
                      </label>
                      <input
                        id="appt-date"
                        type="date"
                        min={todayIst}
                        value={appointmentDate}
                        onChange={(e) => setAppointmentDate(e.target.value)}
                        className="celeste-input mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm"
                      />
                    </div>
                  </div>

                  {/* Stylist selection */}
                  <div>
                    <p className="mb-2 text-sm font-medium text-charcoal-green">{t('joinStaffHeading')}</p>
                    <div className="grid gap-2.5 sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectionMode('any_available');
                          setPreferredStaffId(null);
                        }}
                        className={`cursor-pointer rounded-2xl border p-3 text-left text-xs transition ${
                          selectionMode === 'any_available'
                            ? 'border-deep-sage bg-soft-sage font-semibold text-deep-sage'
                            : 'border-warm-terracotta/45 bg-white hover:bg-warm-ivory'
                        }`}
                      >
                        <Sparkles className="mb-1 h-4 w-4 text-celeste-sage" aria-hidden="true" />
                        <p>{t('joinAnyStylistTitle')}</p>
                      </button>

                      {staffList.map((member) => {
                        const isQual = qualifiedStaff.some((q) => q.id === member.id);
                        const active = selectionMode === 'specific' && preferredStaffId === member.id;
                        return (
                          <button
                            key={member.id}
                            type="button"
                            disabled={!isQual}
                            onClick={() => {
                              setSelectionMode('specific');
                              setPreferredStaffId(member.id);
                            }}
                            className={`flex cursor-pointer items-center gap-2.5 rounded-2xl border p-3 text-left text-xs transition ${
                              active
                                ? 'border-deep-sage bg-soft-sage font-semibold text-deep-sage'
                                : 'border-warm-terracotta/45 bg-white hover:bg-warm-ivory disabled:cursor-not-allowed disabled:opacity-40'
                            }`}
                          >
                            <StaffAvatar staff={member} size="sm" />
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{pick(member, 'name')}</p>
                              <p className="truncate text-[11px] text-charcoal-green/65">
                                {isQual ? pick(member, 'role') : t('joinStylistIneligible')}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Time slots */}
                  <div>
                    <p className="mb-2 text-sm font-medium text-charcoal-green">
                      <Clock className="mr-1.5 inline h-4 w-4 text-celeste-sage" aria-hidden="true" />
                      {t('apptSlotLabel')} *
                    </p>
                    {selectedServiceIds.length === 0 ? (
                      <p className="rounded-xl border border-champagne/50 bg-warm-ivory p-4 text-xs text-charcoal-green/70">
                        {t('apptSelectDateServicesFirst')}
                      </p>
                    ) : slotsLoading ? (
                      <p className="py-4 text-xs text-charcoal-green/70">{t('loadingText')}</p>
                    ) : slotsError ? (
                      <p className="text-xs text-rosewood">{slotsError}</p>
                    ) : slotsData?.is_closed ? (
                      <p className="rounded-xl border border-muted-rose/40 bg-muted-rose/10 p-4 text-xs font-medium text-rosewood">
                        {t('apptNoSlotsClosed')}
                      </p>
                    ) : (slotsData?.slots || []).length === 0 ? (
                      <p className="rounded-xl border border-warm-terracotta/55 bg-warm-sand/50 p-4 text-xs font-medium text-charcoal-green">
                        {t('apptNoSlotsAvailable')}
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                        {(slotsData?.slots || []).map((slot) => {
                          const selected = selectedStartTime === slot.start_time;
                          return (
                            <button
                              key={slot.start_time}
                              type="button"
                              onClick={() => setSelectedStartTime(slot.start_time)}
                              className={`cursor-pointer rounded-xl border px-3 py-2 text-xs font-semibold tabular-nums transition ${
                                selected
                                  ? 'border-deep-sage bg-deep-sage text-warm-ivory shadow-xs'
                                  : 'border-warm-terracotta/50 bg-white text-charcoal-green hover:bg-soft-sage'
                              }`}
                            >
                              {formatTimeHhMm(slot.start_time, lang)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              </div>

              {/* Sticky Summary */}
              <aside className="lg:col-span-4">
                <div className="celeste-card-elevated celeste-double-frame sticky top-24 rounded-3xl border border-warm-terracotta/65 p-6">
                  <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
                    {t('joinSummaryHeading')}
                  </h2>

                  <dl className="mt-4 space-y-2.5 border-y border-warm-terracotta/35 py-4 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-charcoal-green/75">{t('apptDateTimeLabel')}</dt>
                      <dd className="font-semibold text-charcoal-green">
                        {appointmentDate ? formatDateLabel(appointmentDate, lang) : '—'}
                        {selectedStartTime ? ` · ${formatTimeHhMm(selectedStartTime, lang)}` : ''}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-charcoal-green/75">{t('joinSummaryDuration')}</dt>
                      <dd className="font-semibold tabular-nums">{formatMinutes(totalDuration, lang)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-charcoal-green/75">{t('joinSummaryPrice')}</dt>
                      <dd className="font-semibold tabular-nums text-deep-sage">{formatInr(totalPrice)}</dd>
                    </div>
                  </dl>

                  {submitError && (
                    <div
                      role="alert"
                      className="mt-4 flex items-start gap-2 rounded-xl border border-muted-rose/45 bg-muted-rose/12 p-3 text-xs font-medium text-rosewood"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="celeste-btn-primary mt-5 w-full cursor-pointer rounded-xl px-5 py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {submitting ? t('apptSubmitting') : t('apptConfirmBtn')}
                  </button>
                </div>
              </aside>
            </form>
          )
        ) : (
          /* Lookup & Cancel Tab */
          <section className="mx-auto max-w-2xl space-y-6">
            <form
              onSubmit={handleLookupSubmit}
              className="celeste-card-elevated rounded-3xl border border-warm-terracotta/60 p-6 sm:p-8"
            >
              <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
                {t('apptLookupHeading')}
              </h2>
              <p className="mt-1 text-sm text-charcoal-green/75">{t('apptLookupDesc')}</p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="lookup-ref" className="block text-sm font-medium text-charcoal-green">
                    {t('apptLookupRefLabel')} *
                  </label>
                  <input
                    id="lookup-ref"
                    type="text"
                    required
                    value={lookupRef}
                    onChange={(e) => setLookupRef(e.target.value.toUpperCase())}
                    placeholder={t('apptLookupRefPlaceholder')}
                    className="celeste-input mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm uppercase"
                  />
                </div>
                <div>
                  <label htmlFor="lookup-phone" className="block text-sm font-medium text-charcoal-green">
                    {t('joinPhoneLabel')} *
                  </label>
                  <input
                    id="lookup-phone"
                    type="tel"
                    inputMode="numeric"
                    required
                    value={lookupPhone}
                    onChange={(e) => setLookupPhone(sanitizePhoneDigits(e.target.value))}
                    placeholder={t('joinPhonePlaceholder')}
                    className="celeste-input mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm tabular-nums"
                  />
                </div>
              </div>

              {lookupError && (
                <p role="alert" className="mt-3 text-xs font-medium text-rosewood">
                  {lookupError}
                </p>
              )}

              <button
                type="submit"
                disabled={lookupLoading}
                className="celeste-btn-primary mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
              >
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>{t('apptLookupBtn')}</span>
              </button>
            </form>

            {lookupResult && (
              <div className="celeste-card-elevated celeste-double-frame rounded-3xl border border-celeste-sage/35 p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warm-terracotta/35 pb-4">
                  <div>
                    <BohoEyebrow>{lookupResult.reference_code}</BohoEyebrow>
                    <h3 className="mt-1 font-serif text-2xl font-semibold text-charcoal-green">
                      {lookupResult.customer_name}
                    </h3>
                  </div>
                  <span className="rounded-full border border-celeste-sage/35 bg-soft-sage px-3.5 py-1 text-xs font-semibold text-deep-sage">
                    {lookupResult.status}
                  </span>
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-xl bg-warm-ivory p-3.5">
                    <dt className="text-xs text-charcoal-green/65">{t('apptDateTimeLabel')}</dt>
                    <dd className="mt-0.5 font-semibold">
                      {formatDateLabel(lookupResult.appointment_date, lang)} ·{' '}
                      {formatTimeHhMm(lookupResult.start_time, lang)}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-warm-ivory p-3.5">
                    <dt className="text-xs text-charcoal-green/65">{t('statusAssignedStylist')}</dt>
                    <dd className="mt-0.5 flex items-center gap-2 font-semibold">
                      <UserCheck className="h-4 w-4 text-celeste-sage" aria-hidden="true" />
                      <span>{pick(lookupResult.assigned_staff, 'name')}</span>
                    </dd>
                  </div>
                </dl>

                <ul className="mt-4 divide-y divide-warm-terracotta/25 rounded-2xl border border-warm-terracotta/35 bg-white px-4 py-2 text-sm">
                  {(lookupResult.services || []).map((svc, idx) => (
                    <li key={idx} className="flex justify-between py-2">
                      <span>{pickSnapshotName(svc)}</span>
                      <span className="tabular-nums text-deep-sage">
                        {formatMinutes(svc.duration_minutes_snapshot, lang)} ·{' '}
                        {formatInr(svc.price_inr_snapshot)}
                      </span>
                    </li>
                  ))}
                </ul>

                {lookupResult.queue_entry_id && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-celeste-sage/35 bg-soft-sage p-4 text-sm">
                    <span className="font-semibold text-deep-sage">
                      {t('statusTokenLabel')}: {lookupResult.queue_token_display}
                    </span>
                    <Link
                      to={`/status/${lookupResult.queue_entry_id}`}
                      className="celeste-btn-primary rounded-xl px-4 py-2 text-xs font-semibold"
                    >
                      {t('homeOpenRecentTicket')}
                    </Link>
                  </div>
                )}

                {lookupResult.can_cancel && (
                  <button
                    type="button"
                    onClick={() => setCancelModalOpen(true)}
                    className="mt-5 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-muted-rose/50 bg-muted-rose/10 px-4 py-2.5 text-xs font-semibold text-rosewood transition hover:bg-muted-rose hover:text-white"
                  >
                    <XCircle className="h-4 w-4" aria-hidden="true" />
                    <span>{t('apptCancelBtn')}</span>
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      <ConfirmModal
        open={cancelModalOpen}
        title={t('apptCancelConfirmTitle')}
        description={t('apptCancelConfirmDesc', { ref: lookupResult?.reference_code || '' })}
        cancelLabel={t('cancelAction')}
        confirmLabel={t('confirmAction')}
        loading={cancelBusy}
        onCancel={() => setCancelModalOpen(false)}
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
}
