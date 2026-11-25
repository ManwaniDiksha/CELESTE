import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock,
  Coffee,
  Edit3,
  IndianRupee,
  Lock,
  LogOut,
  Plus,
  Power,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  Users,
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
import { DemoResetModal, ServiceFormModal, StaffManageModal } from '../components/OwnerModals.jsx';
import { RealtimeBanner } from '../components/RealtimeBanner.jsx';
import { QueueStatusBadge, StaffAvailabilityBadge, StaffAvatar } from '../components/StatusBadges.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useQueueRealtime } from '../hooks/useQueueRealtime.js';
import {
  cancelAppointmentByOwner,
  createOwnerService,
  getDemoPrefill,
  getOwnerAppointments,
  getOwnerDashboard,
  getOwnerReports,
  resetOwnerDemoData,
  setOwnerStaffQualifications,
  updateOwnerService,
  updateOwnerSettings,
  updateOwnerStaffAvailability,
  updateOwnerStaffDuty,
  updateOwnerStaffProfile,
} from '../services/api.js';
import { isSupabaseConfigured } from '../services/supabase.js';
import {
  formatDateLabel,
  formatInr,
  formatMinutes,
  formatTimeHhMm,
} from '../utils/formatters.js';

const ORDERED_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function cloneOperatingHours(rawHours) {
  const out = {};
  for (const day of ORDERED_DAYS) {
    const val = rawHours?.[day];
    if (val && typeof val === 'object' && val.open && val.close) {
      out[day] = { closed: false, open: val.open, close: val.close };
    } else {
      out[day] = { closed: true, open: '10:00', close: '21:00' };
    }
  }
  return out;
}

export default function OwnerSettingsPage() {
  const { t, lang, pick, pickSnapshotName, labelCategory, labelDay } = useLanguage();
  const { ownerAuth, loginOwner, logoutOwner, demoConfig } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (ownerAuth.authenticated || !demoConfig?.enabled || !demoConfig?.hasOwnerDemo) return;
    let active = true;
    getDemoPrefill()
      .then((res) => {
        if (!active || !res?.data) return;
        if (res.data.ownerEmail) setEmail((prev) => prev || res.data.ownerEmail);
        if (res.data.ownerPassword) setPassword((prev) => prev || res.data.ownerPassword);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [ownerAuth.authenticated, demoConfig?.enabled, demoConfig?.hasOwnerDemo]);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');

  const [dashboard, setDashboard] = useState(null);
  const [reports, setReports] = useState(null);
  const [ownerAppointments, setOwnerAppointments] = useState(null);
  const [selectedReportDate, setSelectedReportDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [feedback, setFeedback] = useState(null);
  const [busyKey, setBusyKey] = useState('');

  // Editable settings form state
  const [capacityInput, setCapacityInput] = useState('30');
  const [cutoffInput, setCutoffInput] = useState('30');
  const [hoursDraft, setHoursDraft] = useState(() => cloneOperatingHours(null));

  // Service filter & modals
  const [serviceStatusFilter, setServiceStatusFilter] = useState('all');
  const [serviceModal, setServiceModal] = useState({ open: false, mode: 'create', service: null, error: '' });
  const [staffModal, setStaffModal] = useState({ open: false, staff: null, error: '' });
  const [demoModal, setDemoModal] = useState({ open: false, error: '' });

  const accessToken = ownerAuth.accessToken;

  const handleAuthFailure = useCallback(
    async (err) => {
      if (err?.status === 401 || err?.status === 403) {
        setAuthError(t('adminSessionExpired'));
        await logoutOwner();
        return true;
      }
      return false;
    },
    [logoutOwner, t]
  );

  const syncSettingsDrafts = useCallback((salonObj) => {
    if (!salonObj) return;
    setCapacityInput(String(salonObj.daily_online_capacity ?? 30));
    setCutoffInput(String(salonObj.online_cutoff_minutes ?? 30));
    setHoursDraft(cloneOperatingHours(salonObj.operating_hours));
  }, []);

  const loadOwnerDashboard = useCallback(
    async ({ silent = false, dateOverride = null } = {}) => {
      if (!ownerAuth.authenticated || !accessToken) return;
      if (!silent) setLoading(true);
      setLoadError('');
      try {
        const targetDate = dateOverride !== null ? dateOverride : selectedReportDate || null;
        const [res, apptRes] = await Promise.all([
          getOwnerDashboard(accessToken, targetDate),
          getOwnerAppointments(accessToken).catch(() => null),
        ]);
        const data = res.data;
        setDashboard(data);
        setReports(data.reports);
        if (apptRes?.data) {
          setOwnerAppointments(apptRes.data);
        }
        if (!targetDate && data?.reports?.selected_date) {
          setSelectedReportDate(data.reports.selected_date);
        }
        if (!silent) {
          syncSettingsDrafts(data.salon);
        }
      } catch (err) {
        if (await handleAuthFailure(err)) return;
        setLoadError(err.message || 'Unable to load owner dashboard.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [ownerAuth.authenticated, accessToken, selectedReportDate, handleAuthFailure, syncSettingsDrafts]
  );

  useEffect(() => {
    if (ownerAuth.authenticated && accessToken) {
      loadOwnerDashboard();
    } else {
      setDashboard(null);
      setReports(null);
      setSelectedReportDate('');
    }
  }, [ownerAuth.authenticated, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const realtime = useQueueRealtime(() => loadOwnerDashboard({ silent: true }), {
    enabled: Boolean(ownerAuth.authenticated && accessToken),
  });

  const showNotice = (type, message) => {
    setFeedback({ type, message });
  };

  const runOwnerMutation = async (key, fn, { syncDraftsAfter = false, onModalError = null } = {}) => {
    setBusyKey(key);
    if (!onModalError) setFeedback(null);
    try {
      const res = await fn();
      const targetDate = selectedReportDate || null;
      const [refreshed, apptRes] = await Promise.all([
        getOwnerDashboard(accessToken, targetDate),
        getOwnerAppointments(accessToken).catch(() => null),
      ]);
      setDashboard(refreshed.data);
      setReports(refreshed.data.reports);
      if (apptRes?.data) {
        setOwnerAppointments(apptRes.data);
      }
      if (syncDraftsAfter) {
        syncSettingsDrafts(refreshed.data.salon);
      }
      showNotice('success', res?.message || 'Updated.');
      return true;
    } catch (err) {
      if (await handleAuthFailure(err)) return false;
      const msg = err.message || 'Operation failed.';
      if (onModalError) {
        onModalError(msg);
      } else {
        showNotice('error', msg);
      }
      return false;
    } finally {
      setBusyKey('');
    }
  };

  const handleReportDateChange = async (nextDate) => {
    setSelectedReportDate(nextDate);
    if (!nextDate || !accessToken) return;
    setBusyKey('reports-date');
    try {
      const res = await getOwnerReports(accessToken, { date: nextDate, limit: 30 });
      setReports(res.data);
    } catch (err) {
      if (await handleAuthFailure(err)) return;
      showNotice('error', err.message || 'Unable to load selected date report.');
    } finally {
      setBusyKey('');
    }
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setAuthSubmitting(true);
    setAuthError('');
    try {
      await loginOwner(email, password);
      setPassword('');
    } catch (err) {
      setAuthError(err.message || 'Owner authentication failed.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleToggleOnlineQueue = async () => {
    const currentOpen = Boolean(dashboard?.salon?.is_online_queue_open);
    await runOwnerMutation(
      'toggle-online-queue',
      () => updateOwnerSettings(accessToken, { is_online_queue_open: !currentOpen }),
      { syncDraftsAfter: true }
    );
  };

  const handleSaveQueueLimits = async (event) => {
    event.preventDefault();
    const cap = Number(capacityInput);
    const cutoff = Number(cutoffInput);
    if (!Number.isInteger(cap) || cap < 0 || cap > 500) {
      showNotice('error', t('adminCapacityError'));
      return;
    }
    if (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > 360) {
      showNotice('error', t('adminCutoffError'));
      return;
    }
    await runOwnerMutation(
      'save-queue-limits',
      () =>
        updateOwnerSettings(accessToken, {
          daily_online_capacity: cap,
          online_cutoff_minutes: cutoff,
        }),
      { syncDraftsAfter: true }
    );
  };

  const handleSaveOperatingHours = async (event) => {
    event.preventDefault();
    const payloadHours = {};
    for (const day of ORDERED_DAYS) {
      const row = hoursDraft[day];
      if (!row || row.closed) {
        payloadHours[day] = null;
      } else {
        if (!row.open || !row.close || row.open >= row.close) {
          showNotice('error', t('adminInvalidHoursError'));
          return;
        }
        payloadHours[day] = { open: row.open, close: row.close };
      }
    }
    await runOwnerMutation(
      'save-operating-hours',
      () => updateOwnerSettings(accessToken, { operating_hours: payloadHours }),
      { syncDraftsAfter: true }
    );
  };

  const staffById = useMemo(() => {
    const map = new Map();
    for (const s of dashboard?.staff || []) {
      map.set(s.id, s);
    }
    return map;
  }, [dashboard?.staff]);

  const servicesByCategory = useMemo(() => {
    const list = (dashboard?.services || []).filter((svc) => {
      if (serviceStatusFilter === 'active') return svc.is_active;
      if (serviceStatusFilter === 'inactive') return !svc.is_active;
      return true;
    });
    const grouped = {};
    for (const svc of list) {
      if (!grouped[svc.category]) grouped[svc.category] = [];
      grouped[svc.category].push(svc);
    }
    return grouped;
  }, [dashboard?.services, serviceStatusFilter]);

  if (ownerAuth.loading) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageLoading />
      </div>
    );
  }

  if (!ownerAuth.authenticated) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory text-charcoal-green">
        <AppHeader />
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-10 sm:px-6 lg:py-16">
          <div className="celeste-card-elevated celeste-double-frame overflow-hidden rounded-3xl border border-warm-terracotta/55">
            <div className="celeste-linen-surface relative overflow-hidden border-b border-warm-terracotta/40 bg-warm-sand/60 px-6 py-5 sm:px-10">
              <BohoCornerLeaf className="pointer-events-none absolute right-2 top-0 h-16 w-16 text-warm-terracotta/40" />
              <div className="relative flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-warm-terracotta/60 bg-soft-sage text-deep-sage">
                  <Lock className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <BohoEyebrow>{t('adminEyebrow')}</BohoEyebrow>
                  <h1 className="mt-0.5 font-serif text-3xl font-semibold text-charcoal-green">
                    {t('ownerLoginTitle')}
                  </h1>
                </div>
              </div>
              <p className="relative mt-2.5 text-sm text-charcoal-green/80">{t('ownerLoginSub')}</p>
            </div>

            <div className="p-6 sm:p-10">
              {!isSupabaseConfigured && (
                <div className="mb-5 rounded-xl border border-muted-rose/45 bg-muted-rose/12 p-4 text-sm text-rosewood">
                  Supabase client configuration (`VITE_SUPABASE_URL` /
                  `VITE_SUPABASE_PUBLISHABLE_KEY`) is missing in frontend environment.
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="owner-email"
                    className="block text-sm font-medium text-charcoal-green"
                  >
                    {t('ownerEmailLabel')}
                  </label>
                  <input
                    id="owner-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={authSubmitting || !isSupabaseConfigured}
                    className="celeste-input mt-1.5 w-full rounded-xl px-4 py-3 text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="owner-password"
                    className="block text-sm font-medium text-charcoal-green"
                  >
                    {t('ownerPasswordLabel')}
                  </label>
                  <input
                    id="owner-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={authSubmitting || !isSupabaseConfigured}
                    className="celeste-input mt-1.5 w-full rounded-xl px-4 py-3 text-sm"
                  />
                </div>

                {(authError || ownerAuth.error) && (
                  <div
                    role="alert"
                    className="celeste-animate-in flex items-start gap-2.5 rounded-xl border border-muted-rose/45 bg-muted-rose/12 px-4 py-3 text-sm text-rosewood"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{authError || ownerAuth.error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authSubmitting || !isSupabaseConfigured}
                  className="celeste-btn-primary w-full cursor-pointer rounded-xl px-5 py-3.5 text-sm font-semibold"
                >
                  {authSubmitting ? t('pinSigningIn') : t('ownerSignInBtn')}
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if ((loading || !dashboard) && !loadError) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageLoading />
      </div>
    );
  }

  if (loadError && !dashboard) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageError message={loadError} onRetry={() => loadOwnerDashboard()} />
      </div>
    );
  }

  const salon = dashboard?.salon || {};
  const overview = dashboard?.overview || {};
  const staffList = dashboard?.staff || [];
  const allServices = dashboard?.services || [];
  const categoryNames = Object.keys(servicesByCategory);
  const selectedSummary = reports?.selected_day_summary || {};
  const selectedEntries = reports?.selected_day_entries || [];
  const dailyHistory = reports?.daily_history || [];

  return (
    <div className="flex min-h-screen flex-col bg-warm-ivory text-charcoal-green">
      <AppHeader
        salonName={salon.name || 'CELESTE'}
        rightSlot={
          <button
            type="button"
            onClick={logoutOwner}
            aria-label={t('signOut')}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-warm-terracotta/65 bg-warm-sand/50 px-3 py-1.5 text-xs font-semibold text-charcoal-green transition hover:bg-muted-rose/15 hover:text-rosewood focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-celeste-sage"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t('signOut')}</span>
          </button>
        }
      />
      <RealtimeBanner status={realtime.status} onReconnect={realtime.reconnect} />

      <main className="mx-auto w-full max-w-[1440px] flex-1 space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Header */}
        <section className="celeste-card celeste-linen-surface relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl border border-warm-terracotta/55 p-5 sm:p-6">
          <BohoCornerLeaf className="pointer-events-none absolute right-2 top-0 hidden h-20 w-20 text-warm-terracotta/35 sm:block" />
          <div className="relative">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-rose">
              <ShieldCheck className="h-4 w-4 text-celeste-sage" aria-hidden="true" />
              <span>{ownerAuth.user?.email || 'Owner'}</span>
            </div>
            <h1 className="mt-1 font-serif text-3xl font-semibold text-charcoal-green sm:text-4xl">
              {t('adminHeading')}
            </h1>
            <p className="mt-1 text-sm text-charcoal-green/75">
              {t('adminSub')} · {formatDateLabel(salon.queue_date, lang)}
            </p>
            <BohoSunburstDivider className="mt-3" />
          </div>

          <div className="relative flex flex-wrap items-center gap-2.5 text-xs">
            <span
              className={`rounded-full border px-3 py-1 font-semibold ${
                salon.is_salon_open
                  ? 'border-celeste-sage/35 bg-soft-sage text-deep-sage'
                  : 'border-muted-rose/40 bg-muted-rose/12 text-rosewood'
              }`}
            >
              {salon.is_salon_open ? t('openNow') : t('closedNow')}
            </span>
            <span className="rounded-full border border-warm-terracotta/65 bg-warm-sand/70 px-3 py-1 font-semibold text-charcoal-green">
              {salon.is_online_queue_open ? t('onlineOpen') : t('onlineClosed')}
            </span>
          </div>
        </section>

        {feedback && (
          <div
            role={feedback.type === 'error' ? 'alert' : 'status'}
            className={`celeste-animate-in flex items-center gap-2.5 rounded-2xl border px-4 py-3 text-sm font-medium ${
              feedback.type === 'error'
                ? 'border-muted-rose/45 bg-muted-rose/12 text-rosewood'
                : 'border-celeste-sage/35 bg-soft-sage text-deep-sage'
            }`}
          >
            {feedback.type === 'error' ? (
              <AlertCircle className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Today Business Overview KPI Strip */}
        <section aria-label={t('adminSnapshotSection')}>
          <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
            {t('adminSnapshotSection')}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
            <div className="flex flex-col justify-between rounded-2xl border border-celeste-sage/30 bg-soft-sage/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-deep-sage">{t('receptionWaitingStat')}</p>
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl border border-celeste-sage/25 bg-white/80 text-deep-sage">
                  <Users className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="font-serif text-3xl font-semibold tabular-nums text-charcoal-green">
                  {overview.waiting_count ?? 0}
                </p>
                <p className="mt-1 text-xs text-charcoal-green/80">{t('receptionWaitingHint')}</p>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-warm-terracotta/70 bg-warm-sand/75 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-charcoal-green">{t('receptionServingStat')}</p>
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl border border-warm-terracotta/60 bg-white/80 text-deep-sage">
                  <UserCheck className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="font-serif text-3xl font-semibold tabular-nums text-charcoal-green">
                  {overview.in_chair_count ?? 0} / {overview.called_count ?? 0}
                </p>
                <p className="mt-1 text-xs text-charcoal-green/80">{t('receptionServingHint')}</p>
              </div>
            </div>

            <div className="celeste-card flex flex-col justify-between rounded-2xl border border-warm-terracotta/55 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-charcoal-green">{t('receptionDoneStat')}</p>
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl border border-celeste-sage/25 bg-soft-sage text-deep-sage">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="font-serif text-3xl font-semibold tabular-nums text-charcoal-green">
                  {overview.served_count ?? 0}
                </p>
                <p className="mt-1 text-xs text-charcoal-green/80">
                  {t('adminOverviewCancelledNoShow')}: {overview.cancelled_count ?? 0} / {overview.no_show_count ?? 0}
                </p>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-2xl border border-dusty-blue/40 bg-dusty-blue/15 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-charcoal-green">{t('adminOverviewStaffServices')}</p>
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-xl border border-dusty-blue/35 bg-white/85 text-deep-sage">
                  <Clock className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="font-serif text-3xl font-semibold tabular-nums text-charcoal-green">
                  {overview.active_services_count ?? 0} / {overview.on_duty_staff_count ?? 0}
                </p>
                <p className="mt-1 text-xs text-charcoal-green/80">
                  {overview.total_services_count ?? 0} / {overview.total_staff_count ?? 0}
                </p>
              </div>
            </div>

            <div className="col-span-2 flex flex-col justify-between rounded-2xl border border-deep-sage bg-deep-sage p-4 text-warm-ivory shadow-sm sm:col-span-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-warm-sand">{t('adminOverviewRevenueLabel')}</p>
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-warm-terracotta/40 bg-white/12 text-warm-sand">
                  <IndianRupee className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-3">
                <p className="font-serif text-3xl font-semibold tabular-nums text-white">
                  {formatInr(overview.daily_revenue_inr ?? 0)}
                </p>
                <p className="mt-1 text-xs text-warm-sand/90">{t('adminOverviewRevenueHint')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Online Queue Controls & Editable Weekly Operating Hours */}
        <section className="grid gap-6 lg:grid-cols-12">
          <div className="celeste-card relative overflow-hidden rounded-3xl border border-warm-terracotta/55 p-6 lg:col-span-5">
            <BohoCornerFlourish className="pointer-events-none absolute right-2 top-2 h-7 w-7 rotate-90 text-warm-terracotta/55" />
            <div className="flex items-center justify-between border-b border-warm-terracotta/35 pb-4 pr-8">
              <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
                {t('adminOperatingSection')}
              </h2>
              <SlidersHorizontal className="h-5 w-5 text-celeste-sage" aria-hidden="true" />
            </div>

            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warm-terracotta/45 bg-warm-sand/50 p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-rose">
                    {salon.is_online_queue_open ? t('onlineOpen') : t('onlineClosed')}
                  </p>
                  <p className="mt-0.5 text-xs text-charcoal-green/80 tabular-nums">
                    {salon.online_entries_today ?? 0} / {salon.daily_online_capacity ?? 30}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busyKey)}
                  onClick={handleToggleOnlineQueue}
                  className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold transition ${
                    salon.is_online_queue_open
                      ? 'border border-muted-rose/50 bg-white text-rosewood hover:bg-muted-rose/10'
                      : 'celeste-btn-primary'
                  }`}
                >
                  {salon.is_online_queue_open
                    ? t('adminOnlineQueueToggleClose')
                    : t('adminOnlineQueueToggleOpen')}
                </button>
              </div>

              <p className="text-xs leading-relaxed text-charcoal-green/75">{t('adminQueueNote')}</p>

              <BohoBranchRule />

              <form onSubmit={handleSaveQueueLimits} className="space-y-3">
                <div>
                  <label htmlFor="owner-capacity" className="block text-xs font-semibold text-charcoal-green">
                    {t('adminCapacityLabel')}
                  </label>
                  <input
                    id="owner-capacity"
                    type="number"
                    min={0}
                    max={500}
                    value={capacityInput}
                    onChange={(e) => setCapacityInput(e.target.value)}
                    disabled={Boolean(busyKey)}
                    className="celeste-input mt-1 w-full rounded-xl px-3.5 py-2 text-sm tabular-nums"
                  />
                </div>

                <div>
                  <label htmlFor="owner-cutoff" className="block text-xs font-semibold text-charcoal-green">
                    {t('adminCutoffLabel')}
                  </label>
                  <input
                    id="owner-cutoff"
                    type="number"
                    min={0}
                    max={360}
                    value={cutoffInput}
                    onChange={(e) => setCutoffInput(e.target.value)}
                    disabled={Boolean(busyKey)}
                    className="celeste-input mt-1 w-full rounded-xl px-3.5 py-2 text-sm tabular-nums"
                  />
                </div>

                <button
                  type="submit"
                  disabled={Boolean(busyKey)}
                  className="celeste-btn-primary w-full cursor-pointer rounded-xl px-4 py-2.5 text-xs font-semibold"
                >
                  {busyKey === 'save-queue-limits' ? t('adminSaving') : t('adminSaveQueueSettingsBtn')}
                </button>
              </form>
            </div>
          </div>

          <form
            onSubmit={handleSaveOperatingHours}
            className="celeste-card rounded-3xl border border-warm-terracotta/50 p-6 lg:col-span-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-terracotta/35 pb-4">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-celeste-sage" aria-hidden="true" />
                <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
                  {t('adminHoursSection')}
                </h2>
              </div>
              <button
                type="submit"
                disabled={Boolean(busyKey)}
                className="celeste-btn-primary cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold"
              >
                {busyKey === 'save-operating-hours' ? t('adminSaving') : t('adminSaveHoursBtn')}
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {ORDERED_DAYS.map((dayKey) => {
                const row = hoursDraft[dayKey] || { closed: true, open: '10:00', close: '21:00' };
                const isToday = salon.day_key === dayKey;
                return (
                  <div
                    key={dayKey}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${
                      isToday
                        ? 'border-celeste-sage/45 bg-soft-sage/65'
                        : 'border-warm-terracotta/45 bg-warm-sand/30'
                    }`}
                  >
                    <span className="w-28 font-semibold text-charcoal-green">{labelDay(dayKey)}</span>

                    <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-charcoal-green">
                      <input
                        type="checkbox"
                        checked={row.closed}
                        onChange={(e) =>
                          setHoursDraft((prev) => ({
                            ...prev,
                            [dayKey]: { ...prev[dayKey], closed: e.target.checked },
                          }))
                        }
                        className="h-4 w-4 accent-rosewood"
                      />
                      <span>{t('adminDayClosedToggle')}</span>
                    </label>

                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        aria-label={`${labelDay(dayKey)} ${t('adminOpenTimeLabel')}`}
                        disabled={row.closed || Boolean(busyKey)}
                        value={row.open}
                        onChange={(e) =>
                          setHoursDraft((prev) => ({
                            ...prev,
                            [dayKey]: { ...prev[dayKey], open: e.target.value },
                          }))
                        }
                        className="celeste-input rounded-lg px-2.5 py-1.5 text-xs tabular-nums"
                      />
                      <span className="text-xs text-charcoal-green/60">–</span>
                      <input
                        type="time"
                        aria-label={`${labelDay(dayKey)} ${t('adminCloseTimeLabel')}`}
                        disabled={row.closed || Boolean(busyKey)}
                        value={row.close}
                        onChange={(e) =>
                          setHoursDraft((prev) => ({
                            ...prev,
                            [dayKey]: { ...prev[dayKey], close: e.target.value },
                          }))
                        }
                        className="celeste-input rounded-lg px-2.5 py-1.5 text-xs tabular-nums"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </form>
        </section>

        {/* Staff Roster, Duty, Availability & Qualifications */}
        <section className="celeste-linen-surface rounded-3xl border border-warm-terracotta/45 bg-warm-sand/40 p-6">
          <div className="flex items-center gap-2">
            <BohoBotanicalSprig className="h-4 w-4 text-celeste-sage" />
            <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
              {t('adminStaffSection')}
            </h2>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {staffList.map((member) => {
              const isBusyOrActive =
                member.availability_status === 'Busy' || Boolean(member.has_active_entry);
              return (
                <article
                  key={member.id}
                  className="celeste-card celeste-interactive-card flex flex-col justify-between rounded-2xl border border-warm-terracotta/55 p-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <StaffAvatar staff={member} size="md" />
                      <StaffAvailabilityBadge
                        availabilityStatus={member.availability_status}
                        isOnDuty={member.is_on_duty}
                      />
                    </div>
                    <p className="mt-3 font-serif text-xl font-semibold text-charcoal-green">
                      {pick(member, 'name')}
                    </p>
                    <p className="text-xs font-medium text-muted-rose">{pick(member, 'role')}</p>
                    <p className="mt-1.5 text-xs text-charcoal-green/75">{pick(member, 'speciality')}</p>
                    <p className="mt-3 border-t border-warm-terracotta/30 pt-2 text-xs font-medium text-charcoal-green/80 tabular-nums">
                      {member.qualified_service_ids?.length || 0} {t('adminManageQualificationsHeading').toLowerCase()} ·{' '}
                      {member.waiting_count ?? 0} {t('waitingSuffix')}
                    </p>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-warm-terracotta/30 pt-3">
                    <button
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={() => {
                        setStaffModal({ open: true, staff: member, error: '' });
                      }}
                      className="celeste-btn-primary inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold"
                    >
                      <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{t('adminEditStaffBtn')}</span>
                    </button>

                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={Boolean(busyKey) || (member.is_on_duty && isBusyOrActive)}
                        onClick={() =>
                          runOwnerMutation(`duty-${member.id}`, () =>
                            updateOwnerStaffDuty(accessToken, member.id, !member.is_on_duty)
                          )
                        }
                        className="celeste-btn-secondary inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold"
                      >
                        <Power className="h-3 w-3" aria-hidden="true" />
                        <span>{member.is_on_duty ? t('adminDutyOffBtn') : t('adminDutyOnBtn')}</span>
                      </button>

                      {member.is_on_duty && (
                        <button
                          type="button"
                          disabled={Boolean(busyKey) || isBusyOrActive}
                          onClick={() =>
                            runOwnerMutation(`avail-${member.id}`, () =>
                              updateOwnerStaffAvailability(
                                accessToken,
                                member.id,
                                member.availability_status === 'On Break' ? 'Available' : 'On Break'
                              )
                            )
                          }
                          className="celeste-btn-secondary inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold"
                        >
                          <Coffee className="h-3 w-3" aria-hidden="true" />
                          <span>
                            {member.availability_status === 'On Break'
                              ? t('adminAvailableBtn')
                              : t('adminBreakBtn')}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Service Catalogue CRUD & Coverage */}
        <section className="celeste-card rounded-3xl border border-warm-terracotta/50 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-warm-terracotta/35 pb-4">
            <div className="flex items-center gap-2">
              <BohoBotanicalSprig className="h-4 w-4 text-celeste-sage" />
              <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
                {t('adminServicesSection')} ({allServices.length})
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex gap-1">
                {[
                  { key: 'all', label: t('adminCategoryFilterAll') },
                  { key: 'active', label: t('adminActiveLabel') },
                  { key: 'inactive', label: t('adminInactiveLabel') },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setServiceStatusFilter(tab.key)}
                    className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                      serviceStatusFilter === tab.key
                        ? 'border-deep-sage bg-deep-sage text-warm-ivory'
                        : 'border-warm-terracotta/45 bg-warm-sand/40 text-charcoal-green/80 hover:bg-soft-sage'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() =>
                  setServiceModal({ open: true, mode: 'create', service: null, error: '' })
                }
                className="celeste-btn-primary inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>{t('adminAddServiceBtn')}</span>
              </button>
            </div>
          </div>

          <div className="mt-5 space-y-6">
            {categoryNames.map((catKey) => (
              <div key={catKey}>
                <h3 className="mb-3 font-serif text-xl font-semibold text-deep-sage">
                  {labelCategory(catKey)}
                </h3>
                <div className="overflow-x-auto rounded-2xl border border-warm-terracotta/40">
                  <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-warm-terracotta/45 bg-warm-sand/55 text-xs uppercase tracking-wider text-charcoal-green/75">
                        <th className="py-2.5 pl-4 pr-3">{t('adminNameEnLabel')}</th>
                        <th className="py-2.5 px-3">{t('adminNameGuLabel')}</th>
                        <th className="py-2.5 px-3">{t('adminServiceDurationLabel')}</th>
                        <th className="py-2.5 px-3">{t('adminServicePriceLabel')}</th>
                        <th className="py-2.5 px-3">{t('adminQualifiedStylistsLabel')}</th>
                        <th className="py-2.5 px-3">{t('adminStatusCol')}</th>
                        <th className="py-2.5 pl-3 pr-4 text-right">{t('adminActionsCol')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-warm-terracotta/25 bg-white">
                      {(servicesByCategory[catKey] || []).map((svc) => {
                        const qualNames = (svc.qualified_staff_ids || [])
                          .map((sid) => pick(staffById.get(sid), 'name'))
                          .filter(Boolean);
                        return (
                          <tr key={svc.id} className="hover:bg-warm-ivory/75">
                            <td className="py-2.5 pl-4 pr-3 font-medium text-charcoal-green">
                              {svc.name_en}
                            </td>
                            <td className="py-2.5 px-3 text-charcoal-green/85">{svc.name_gu}</td>
                            <td className="py-2.5 px-3 tabular-nums">
                              {formatMinutes(svc.duration_minutes, lang)}
                            </td>
                            <td className="py-2.5 px-3 font-semibold tabular-nums text-deep-sage">
                              {formatInr(svc.price_inr)}
                            </td>
                            <td className="py-2.5 px-3 text-xs text-charcoal-green/80">
                              <span className="font-semibold tabular-nums">
                                {qualNames.length}
                              </span>
                              {qualNames.length > 0 ? ` · ${qualNames.join(', ')}` : ''}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                                  svc.is_active
                                    ? 'border-celeste-sage/35 bg-soft-sage text-deep-sage'
                                    : 'border-muted-rose/40 bg-muted-rose/12 text-rosewood'
                                }`}
                              >
                                {svc.is_active ? t('adminActiveLabel') : t('adminInactiveLabel')}
                              </span>
                            </td>
                            <td className="py-2.5 pl-3 pr-4 text-right">
                              <div className="inline-flex gap-1.5">
                                <button
                                  type="button"
                                  disabled={Boolean(busyKey)}
                                  onClick={() =>
                                    setServiceModal({
                                      open: true,
                                      mode: 'edit',
                                      service: svc,
                                      error: '',
                                    })
                                  }
                                  className="celeste-btn-secondary cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold"
                                >
                                  {t('receptionEditEntry')}
                                </button>
                                <button
                                  type="button"
                                  disabled={Boolean(busyKey)}
                                  onClick={() =>
                                    runOwnerMutation(`toggle-svc-${svc.id}`, () =>
                                      updateOwnerService(accessToken, svc.id, {
                                        is_active: !svc.is_active,
                                      })
                                    )
                                  }
                                  className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                                    svc.is_active
                                      ? 'border-muted-rose/45 bg-warm-sand/50 text-rosewood hover:bg-muted-rose/12'
                                      : 'border-celeste-sage/45 bg-soft-sage text-deep-sage hover:bg-deep-sage hover:text-white'
                                  }`}
                                >
                                  {svc.is_active
                                    ? t('adminDisableServiceBtn')
                                    : t('adminEnableServiceBtn')}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Daily & Historical Reports */}
        <section className="celeste-card rounded-3xl border border-warm-terracotta/55 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-warm-terracotta/35 pb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-celeste-sage" aria-hidden="true" />
              <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
                {t('adminReportsSection')}
              </h2>
            </div>

            <div className="flex items-center gap-2.5">
              <label htmlFor="owner-report-date" className="text-xs font-semibold text-charcoal-green">
                {t('adminReportDateLabel')}
              </label>
              <input
                id="owner-report-date"
                type="date"
                value={selectedReportDate}
                onChange={(e) => handleReportDateChange(e.target.value)}
                disabled={Boolean(busyKey)}
                className="celeste-input rounded-xl px-3 py-1.5 text-xs tabular-nums"
              />
            </div>
          </div>

          <p className="mt-3 rounded-xl border border-champagne/65 bg-warm-sand/40 px-4 py-2.5 text-xs text-charcoal-green/80">
            {t('adminReportRevenueBasisNote')}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3.5 sm:grid-cols-5">
            <div className="rounded-xl border border-warm-terracotta/45 bg-warm-ivory p-3.5">
              <p className="text-xs font-medium text-charcoal-green/75">{t('adminTotalEntriesCol')}</p>
              <p className="mt-1 font-serif text-2xl font-semibold tabular-nums">
                {selectedSummary.total_entries ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-celeste-sage/30 bg-soft-sage/65 p-3.5">
              <p className="text-xs font-medium text-deep-sage">{t('adminServedCol')}</p>
              <p className="mt-1 font-serif text-2xl font-semibold tabular-nums text-charcoal-green">
                {selectedSummary.served_count ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-warm-terracotta/45 bg-warm-ivory p-3.5">
              <p className="text-xs font-medium text-charcoal-green/75">{t('adminOverviewCancelledNoShow')}</p>
              <p className="mt-1 font-serif text-2xl font-semibold tabular-nums">
                {selectedSummary.cancelled_count ?? 0} / {selectedSummary.no_show_count ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-warm-terracotta/45 bg-warm-ivory p-3.5">
              <p className="text-xs font-medium text-charcoal-green/75">{t('adminCompletedServicesStat')}</p>
              <p className="mt-1 font-serif text-2xl font-semibold tabular-nums">
                {selectedSummary.completed_services_count ?? 0}
              </p>
            </div>
            <div className="col-span-2 rounded-xl border border-deep-sage bg-deep-sage p-3.5 text-white sm:col-span-1">
              <p className="text-xs font-medium text-warm-sand">{t('adminOverviewRevenueLabel')}</p>
              <p className="mt-1 font-serif text-2xl font-semibold tabular-nums">
                {formatInr(selectedSummary.daily_revenue_inr ?? 0)}
              </p>
            </div>
          </div>

          {/* Historical Daily Summaries */}
          <div className="mt-6 grid gap-6 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-5">
              <h3 className="mb-2.5 font-serif text-xl font-semibold text-charcoal-green">
                {t('adminReportHistoryTitle')}
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-warm-terracotta/40">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-warm-terracotta/45 bg-warm-sand/55 uppercase tracking-wider text-charcoal-green/75">
                      <th className="py-2.5 pl-3 pr-2">{t('adminReportDateLabel')}</th>
                      <th className="py-2.5 px-2 text-right">{t('adminServedCol')}</th>
                      <th className="py-2.5 px-2 text-right">{t('adminOverviewCancelledNoShow')}</th>
                      <th className="py-2.5 pl-2 pr-3 text-right">{t('adminServicePriceLabel')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-terracotta/25 bg-white">
                    {dailyHistory.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-charcoal-green/65">
                          {t('adminReportNoData')}
                        </td>
                      </tr>
                    ) : (
                      dailyHistory.map((row) => (
                        <tr
                          key={row.queue_date}
                          onClick={() => handleReportDateChange(row.queue_date)}
                          className={`cursor-pointer transition ${
                            row.queue_date === selectedReportDate
                              ? 'bg-soft-sage/75 font-semibold'
                              : 'hover:bg-warm-ivory'
                          }`}
                        >
                          <td className="py-2.5 pl-3 pr-2 tabular-nums text-charcoal-green">
                            {row.queue_date}
                          </td>
                          <td className="py-2.5 px-2 text-right tabular-nums">{row.served_count}</td>
                          <td className="py-2.5 px-2 text-right tabular-nums">
                            {row.cancelled_count} / {row.no_show_count}
                          </td>
                          <td className="py-2.5 pl-2 pr-3 text-right font-semibold tabular-nums text-deep-sage">
                            {formatInr(row.daily_revenue_inr)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="min-w-0 lg:col-span-7">
              <h3 className="mb-2.5 font-serif text-xl font-semibold text-charcoal-green">
                {t('adminReportEntriesTitle')} ({selectedReportDate || salon.queue_date})
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-warm-terracotta/40">
                <table className="w-full min-w-[540px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-warm-terracotta/45 bg-warm-sand/55 uppercase tracking-wider text-charcoal-green/75">
                      <th className="py-2.5 pl-3 pr-2">{t('adminTokenCol')}</th>
                      <th className="py-2.5 px-2">{t('adminSourceCol')}</th>
                      <th className="py-2.5 px-2">{t('adminServicesSection')}</th>
                      <th className="py-2.5 px-2">{t('adminStatusCol')}</th>
                      <th className="py-2.5 pl-2 pr-3 text-right">{t('adminServicePriceLabel')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-terracotta/25 bg-white">
                    {selectedEntries.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-charcoal-green/65">
                          {t('adminReportNoData')}
                        </td>
                      </tr>
                    ) : (
                      selectedEntries.map((entry) => (
                        <tr key={entry.entry_id} className="hover:bg-warm-ivory/75">
                          <td className="py-2.5 pl-3 pr-2 font-serif text-base font-bold tabular-nums text-charcoal-green">
                            {entry.token_display}
                            <span className="ml-1.5 font-sans text-[10px] font-semibold uppercase text-muted-rose">
                              {entry.is_demo ? t('adminDemoBadge') : t('adminRealBadge')}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-charcoal-green/80">
                            {pick(entry.assigned_staff, 'name')} ({entry.source})
                          </td>
                          <td className="py-2.5 px-2 text-charcoal-green">
                            {(entry.services || []).map(pickSnapshotName).join(', ')}
                          </td>
                          <td className="py-2.5 px-2">
                            <QueueStatusBadge status={entry.status} />
                          </td>
                          <td className="py-2.5 pl-2 pr-3 text-right font-semibold tabular-nums text-deep-sage">
                            {formatInr(entry.total_price_inr)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Upcoming & Today Appointments (Zero-PII) */}
        <section className="celeste-card rounded-3xl border border-warm-terracotta/55 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warm-terracotta/35 pb-4">
            <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
              {t('ownerApptsSection')}
            </h2>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-soft-sage px-3 py-1 text-deep-sage">
                {t('receptionApptsTodayTab')}: {ownerAppointments?.summary?.today_total ?? 0}
              </span>
              <span className="rounded-full bg-warm-sand px-3 py-1 text-charcoal-green">
                {t('receptionApptsUpcomingTab')}: {ownerAppointments?.summary?.upcoming_total ?? 0}
              </span>
            </div>
          </div>

          {(() => {
            const allOwnerAppts = [
              ...(ownerAppointments?.today_appointments || []),
              ...(ownerAppointments?.upcoming_appointments || []),
            ];
            if (allOwnerAppts.length === 0) {
              return (
                <p className="py-6 text-center text-sm text-charcoal-green/65">
                  {t('receptionApptsEmpty')}
                </p>
              );
            }
            return (
              <div className="mt-4 overflow-x-auto rounded-2xl border border-warm-terracotta/40">
                <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-warm-terracotta/40 bg-warm-sand/55 uppercase tracking-wider text-charcoal-green/70">
                      <th className="py-2.5 pl-3 pr-2">{t('apptLookupRefLabel')}</th>
                      <th className="py-2.5 px-2">{t('apptDateTimeLabel')}</th>
                      <th className="py-2.5 px-2">{t('receptionColServices')}</th>
                      <th className="py-2.5 px-2">{t('receptionColStylist')}</th>
                      <th className="py-2.5 px-2">{t('adminStatusCol')}</th>
                      <th className="py-2.5 pl-2 pr-3 text-right">{t('adminActionsCol')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-terracotta/25 bg-white">
                    {allOwnerAppts.map((appt) => (
                      <tr key={appt.appointment_id}>
                        <td className="py-2.5 pl-3 pr-2 font-mono font-bold text-deep-sage">
                          {appt.reference_code}
                        </td>
                        <td className="py-2.5 px-2 tabular-nums">
                          {formatDateLabel(appt.appointment_date, lang)} ·{' '}
                          {formatTimeHhMm(appt.start_time, lang)}
                        </td>
                        <td className="py-2.5 px-2">
                          {(appt.services || []).map(pickSnapshotName).join(', ')}
                        </td>
                        <td className="py-2.5 px-2 font-medium">
                          {pick(appt.assigned_staff, 'name')}
                        </td>
                        <td className="py-2.5 px-2 font-semibold">{appt.status}</td>
                        <td className="py-2.5 pl-2 pr-3 text-right">
                          {appt.can_cancel && (
                            <button
                              type="button"
                              disabled={Boolean(busyKey)}
                              onClick={() =>
                                runOwnerMutation(
                                  `owner-cancel-appt-${appt.appointment_id}`,
                                  () => cancelAppointmentByOwner(accessToken, appt.appointment_id)
                                )
                              }
                              className="cursor-pointer rounded-lg border border-muted-rose/45 bg-muted-rose/10 px-2.5 py-1 text-[11px] font-semibold text-rosewood hover:bg-muted-rose hover:text-white"
                            >
                              {t('cancelAction')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </section>

        {/* Safe Demo Reset Section */}
        <section className="celeste-double-frame flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-muted-rose/45 bg-warm-sand/50 p-6">
          <div>
            <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
              {t('adminDemoSection')}
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-charcoal-green/80 sm:text-sm">
              {t('adminDemoResetDesc', { count: overview.today_demo_entries_count ?? 0 })}
            </p>
          </div>
          <button
            type="button"
            disabled={Boolean(busyKey)}
            onClick={() => setDemoModal({ open: true, error: '' })}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-rosewood/45 bg-rosewood px-5 py-3 text-xs font-semibold text-white transition hover:bg-rosewood/90 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>{t('adminDemoResetBtn')}</span>
          </button>
        </section>
      </main>

      <ServiceFormModal
        open={serviceModal.open}
        mode={serviceModal.mode}
        initialService={serviceModal.service}
        staffList={staffList}
        busy={Boolean(busyKey)}
        serverError={serviceModal.error}
        onClose={() => setServiceModal({ open: false, mode: 'create', service: null, error: '' })}
        onSubmit={async (payload) => {
          const ok = await runOwnerMutation(
            'service-modal',
            () =>
              serviceModal.mode === 'edit' && serviceModal.service
                ? updateOwnerService(accessToken, serviceModal.service.id, payload)
                : createOwnerService(accessToken, payload),
            {
              onModalError: (msg) =>
                setServiceModal((prev) => ({ ...prev, error: msg })),
            }
          );
          if (ok) {
            setServiceModal({ open: false, mode: 'create', service: null, error: '' });
          }
        }}
      />

      <StaffManageModal
        open={staffModal.open}
        staffMember={staffModal.staff}
        services={allServices}
        busy={Boolean(busyKey)}
        serverError={staffModal.error}
        onClose={() => setStaffModal({ open: false, staff: null, error: '' })}
        onSaveProfile={async (staffId, payload) => {
          const ok = await runOwnerMutation(
            'staff-profile',
            () => updateOwnerStaffProfile(accessToken, staffId, payload),
            {
              onModalError: (msg) => setStaffModal((prev) => ({ ...prev, error: msg })),
            }
          );
          if (ok) {
            setStaffModal({ open: false, staff: null, error: '' });
          }
        }}
        onSaveQualifications={async (staffId, serviceIds) => {
          const ok = await runOwnerMutation(
            'staff-quals',
            () => setOwnerStaffQualifications(accessToken, staffId, serviceIds),
            {
              onModalError: (msg) => setStaffModal((prev) => ({ ...prev, error: msg })),
            }
          );
          if (ok) {
            setStaffModal({ open: false, staff: null, error: '' });
          }
        }}
      />

      <DemoResetModal
        open={demoModal.open}
        demoCount={overview.today_demo_entries_count ?? 0}
        busy={Boolean(busyKey)}
        serverError={demoModal.error}
        onClose={() => setDemoModal({ open: false, error: '' })}
        onConfirm={async (phrase) => {
          const ok = await runOwnerMutation(
            'demo-reset',
            () => resetOwnerDemoData(accessToken, phrase),
            {
              onModalError: (msg) => setDemoModal((prev) => ({ ...prev, error: msg })),
            }
          );
          if (ok) {
            setDemoModal({ open: false, error: '' });
          }
        }}
      />
    </div>
  );
}
