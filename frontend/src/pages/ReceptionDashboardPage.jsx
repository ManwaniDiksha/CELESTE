import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  IndianRupee,
  LogOut,
  Navigation,
  Phone,
  Play,
  Plus,
  Search,
  UserCheck,
  Users,
  UserX,
  XCircle,
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader.jsx';
import { BohoEyebrow } from '../components/BohoAccents.jsx';
import { ConfirmModal } from '../components/ConfirmModal.jsx';
import { PageError, PageLoading } from '../components/FeedbackStates.jsx';
import { PinGateCard } from '../components/PinGateCard.jsx';
import { RealtimeBanner } from '../components/RealtimeBanner.jsx';
import {
  CorrectEntryModal,
  EntryDetailModal,
  WalkInModal,
} from '../components/ReceptionModals.jsx';
import {
  QueueStatusBadge,
  StaffAvailabilityBadge,
  StaffAvatar,
} from '../components/StatusBadges.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useQueueRealtime } from '../hooks/useQueueRealtime.js';
import {
  addWalkInCustomer,
  callNextByReception,
  cancelAppointmentByReception,
  cancelEntryByReception,
  checkInAppointmentByReception,
  completeServiceByReception,
  correctEntryByReception,
  getReceptionAppointments,
  getReceptionDashboard,
  getReceptionEntryDetails,
  markAppointmentNoShowByReception,
  markNoShowByReception,
  startServiceByReception,
  updateStaffAvailabilityByReception,
} from '../services/api.js';
import {
  computeLiveArrivalCountdown,
  computeLiveServiceTimer,
  formatDateLabel,
  formatInr,
  formatLiveIstClock,
  formatMinutes,
  formatSecondsTimer,
  formatTimeHhMm,
} from '../utils/formatters.js';

export default function ReceptionDashboardPage() {
  const { t, lang, pick, pickSnapshotName, labelStatus } = useLanguage();
  const { pinSession, refreshPinSession, invalidatePinSession, logoutPin } = useAuth();

  const isReceptionAuthed =
    pinSession.authenticated && pinSession.scope === 'reception';

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [busyKey, setBusyKey] = useState('');

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [detailState, setDetailState] = useState({ open: false, loading: false, data: null, error: '' });
  const [confirmState, setConfirmState] = useState({ open: false, type: null, entry: null });
  const [appointmentsData, setAppointmentsData] = useState(null);
  const [apptTab, setApptTab] = useState('today');
  const [apptSearch, setApptSearch] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadDashboard = useCallback(
    async ({ silent = false } = {}) => {
      if (!isReceptionAuthed) return;
      if (!silent) setLoading(true);
      setError('');
      try {
        const [res, apptRes] = await Promise.all([
          getReceptionDashboard(),
          getReceptionAppointments().catch(() => null),
        ]);
        setDashboard(res.data);
        if (apptRes?.data) {
          setAppointmentsData(apptRes.data);
        }
      } catch (err) {
        if (err.status === 401) {
          invalidatePinSession(
            lang === 'gu'
              ? 'તમારું રિસેપ્શન સત્ર સમાપ્ત થઈ ગયું છે અથવા અમાન્ય છે. કૃપા કરીને ફરી સાઇન ઇન કરો.'
              : 'Your reception session expired or is no longer valid. Please sign in again.'
          );
          return;
        }
        if (err.status === 403) {
          const refreshed = await refreshPinSession();
          if (!refreshed?.authenticated) {
            invalidatePinSession(
              err.message || 'Your reception session could not be verified. Please sign in again.'
            );
          } else if (refreshed.scope === 'reception') {
            setError(err.message || 'Unable to load reception dashboard.');
          }
          return;
        }
        setError(err.message || 'Unable to load reception dashboard.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [isReceptionAuthed, lang, invalidatePinSession, refreshPinSession]
  );

  useEffect(() => {
    if (isReceptionAuthed) {
      loadDashboard();
    } else {
      setDashboard(null);
    }
  }, [isReceptionAuthed, loadDashboard]);

  const realtime = useQueueRealtime(() => loadDashboard({ silent: true }), {
    enabled: isReceptionAuthed,
  });

  useEffect(() => {
    if (!isReceptionAuthed) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isReceptionAuthed]);

  const showNotice = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  };

  const runMutation = async (key, fn, fallbackMsg) => {
    setBusyKey(key);
    setFeedback(null);
    try {
      const res = await fn();
      showNotice('success', res?.message || 'Updated successfully.');
      await loadDashboard({ silent: true });
    } catch (err) {
      showNotice('error', err.message || fallbackMsg);
    } finally {
      setBusyKey('');
    }
  };

  const openDetails = async (entryId) => {
    setDetailState({ open: true, loading: true, data: null, error: '' });
    try {
      const res = await getReceptionEntryDetails(entryId);
      setDetailState({ open: true, loading: false, data: res.data, error: '' });
    } catch (err) {
      setDetailState({
        open: true,
        loading: false,
        data: null,
        error: err.message || 'Unable to load entry details.',
      });
    }
  };

  const handleConfirmModal = async () => {
    const { type, entry } = confirmState;
    if (!entry) return;
    setConfirmState({ open: false, type: null, entry: null });
    if (type === 'noshow') {
      await runMutation(
        `noshow-${entry.entry_id}`,
        () => markNoShowByReception(entry.entry_id),
        'Unable to mark No-show.'
      );
    } else if (type === 'cancel') {
      await runMutation(
        `cancel-${entry.entry_id}`,
        () => cancelEntryByReception(entry.entry_id),
        'Unable to cancel entry.'
      );
    } else if (type === 'cancel-appt') {
      await runMutation(
        `cancel-appt-${entry.appointment_id}`,
        () => cancelAppointmentByReception(entry.appointment_id),
        'Unable to cancel appointment.'
      );
    }
  };

  const combinedQueue = useMemo(() => {
    if (!dashboard) return [];
    const list = [...(dashboard.in_chair_entries || []), ...(dashboard.queue_entries || [])];
    return list.filter((entry) => {
      if (statusFilter !== 'ALL' && entry.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        entry.token_display?.toLowerCase().includes(q) ||
        entry.customer_name?.toLowerCase().includes(q) ||
        entry.customer_phone?.toLowerCase().includes(q)
      );
    });
  }, [dashboard, statusFilter, searchQuery]);

  const displayedAppointments = useMemo(() => {
    const raw =
      apptTab === 'today'
        ? appointmentsData?.today_appointments || []
        : appointmentsData?.upcoming_appointments || [];
    if (!apptSearch.trim()) return raw;
    const q = apptSearch.trim().toLowerCase();
    return raw.filter(
      (a) =>
        a.reference_code?.toLowerCase().includes(q) ||
        a.customer_name?.toLowerCase().includes(q) ||
        a.customer_phone?.toLowerCase().includes(q)
    );
  }, [appointmentsData, apptTab, apptSearch]);

  if (pinSession.loading) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageLoading />
      </div>
    );
  }

  if (!isReceptionAuthed) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PinGateCard scope="reception" />
      </div>
    );
  }

  if ((loading || !dashboard) && !error) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageLoading />
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageError message={error} onRetry={() => loadDashboard()} />
      </div>
    );
  }

  const salon = dashboard?.salon || {};
  const summary = dashboard?.summary || {};
  const staffCards = dashboard?.staff_cards || [];
  const walkInOptions = dashboard?.walk_in_options || { services: [], qualifications: [] };

  return (
    <div className="flex min-h-screen flex-col bg-warm-ivory text-charcoal-green">
      <AppHeader
        salonName={salon.name || 'CELESTE'}
        rightSlot={
          <button
            type="button"
            onClick={logoutPin}
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
        {/* Top Operational Header Strip */}
        <section className="celeste-card celeste-linen-surface flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-warm-terracotta/55 p-5 sm:p-6">
          <div>
            <BohoEyebrow>{salon.name || 'CELESTE'} {t('receptionEyebrow')}</BohoEyebrow>
            <h1 className="mt-1 font-serif text-3xl font-semibold text-charcoal-green sm:text-4xl">
              {t('receptionHeading')}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-xs">
              <span className="font-medium text-charcoal-green/75">
                {formatDateLabel(salon.queue_date, lang)} ·{' '}
                <strong className="tabular-nums text-charcoal-green">
                  {formatLiveIstClock(new Date(nowMs))}
                </strong>
              </span>
              <span
                className={`rounded-full border px-3 py-0.5 font-semibold ${
                  salon.is_salon_open
                    ? 'border-celeste-sage/30 bg-soft-sage text-deep-sage'
                    : 'border-muted-rose/40 bg-muted-rose/12 text-muted-rose'
                }`}
              >
                {salon.is_salon_open ? t('openNow') : t('closedNow')}
              </span>
              <span className="rounded-full border border-warm-terracotta/65 bg-warm-sand/65 px-3 py-0.5 font-semibold text-charcoal-green">
                {salon.is_online_queue_open ? t('onlineOpen') : t('onlineClosed')}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setWalkInOpen(true)}
            className="celeste-btn-primary inline-flex cursor-pointer items-center gap-2 rounded-xl bg-celeste-sage px-6 py-3.5 text-sm font-semibold text-white hover:bg-deep-sage"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{t('receptionAddWalkIn')}</span>
          </button>
        </section>

        {feedback && (
          <div
            role="status"
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

        {/* Overview KPI Strip */}
        <section
          aria-label="Daily overview"
          className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5"
        >
          <div className="flex flex-col justify-between rounded-2xl border border-celeste-sage/30 bg-soft-sage/80 p-4 shadow-2xs transition hover:border-celeste-sage/55">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-deep-sage">
                {t('receptionWaitingStat')}
              </p>
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-celeste-sage/25 bg-white/80 text-deep-sage"
              >
                <Users className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3">
              <p className="font-serif text-3xl font-semibold leading-none tabular-nums text-charcoal-green sm:text-4xl">
                {summary.waiting_count ?? 0}
              </p>
              <p className="mt-1.5 text-xs font-medium text-charcoal-green/80">
                {t('receptionWaitingHint')}
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-warm-terracotta/70 bg-warm-sand/75 p-4 shadow-2xs transition hover:border-warm-terracotta">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-charcoal-green">
                {t('receptionServingStat')}
              </p>
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-warm-terracotta/60 bg-white/80 text-deep-sage"
              >
                <UserCheck className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3">
              <p className="font-serif text-3xl font-semibold leading-none tabular-nums text-charcoal-green sm:text-4xl">
                {summary.in_chair_count ?? 0} / {summary.called_count ?? 0}
              </p>
              <p className="mt-1.5 text-xs font-medium text-charcoal-green/80">
                {t('receptionServingHint')}
              </p>
            </div>
          </div>

          <div className="celeste-card flex flex-col justify-between rounded-2xl border border-warm-terracotta/55 p-4 transition hover:border-warm-terracotta">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-charcoal-green">
                {t('receptionDoneStat')}
              </p>
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-celeste-sage/25 bg-soft-sage text-deep-sage"
              >
                <CheckCircle2 className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3">
              <p className="font-serif text-3xl font-semibold leading-none tabular-nums text-charcoal-green sm:text-4xl">
                {summary.served_count ?? 0}
              </p>
              <p className="mt-1.5 text-xs font-medium text-charcoal-green/80">
                {t('receptionDoneHint')}
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between rounded-2xl border border-dusty-blue/40 bg-dusty-blue/15 p-4 shadow-2xs transition hover:border-dusty-blue/70">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-charcoal-green">
                {t('receptionAvgWaitStat')}
              </p>
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-dusty-blue/35 bg-white/85 text-deep-sage"
              >
                <Clock className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3">
              <p className="font-serif text-3xl font-semibold leading-none tabular-nums text-charcoal-green sm:text-4xl">
                {formatMinutes(summary.average_estimated_wait_minutes ?? 0, lang)}
              </p>
              <p className="mt-1.5 text-xs font-medium text-charcoal-green/80">
                {t('receptionAvgWaitHint')}
              </p>
            </div>
          </div>

          <div className="col-span-2 flex flex-col justify-between rounded-2xl border border-deep-sage bg-deep-sage p-4 text-warm-ivory shadow-sm sm:col-span-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-warm-sand">
                {t('receptionRevenueStat')}
              </p>
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-warm-terracotta/40 bg-white/12 text-warm-sand"
              >
                <IndianRupee className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-3">
              <p className="font-serif text-3xl font-semibold leading-none tabular-nums text-white sm:text-4xl">
                {formatInr(summary.daily_revenue_inr ?? 0)}
              </p>
              <p className="mt-1.5 text-xs font-medium text-warm-sand/90">
                {t('receptionRevenueHint')}
              </p>
            </div>
          </div>
        </section>

        {/* 5 Staff Stations on Warm Sand Section */}
        <section className="celeste-linen-surface rounded-3xl border border-warm-terracotta/45 bg-warm-sand/40 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <BohoEyebrow>{t('receptionStaffEyebrow')}</BohoEyebrow>
              <h2 className="mt-0.5 font-serif text-2xl font-semibold text-charcoal-green sm:text-3xl">
                {t('receptionStaffTitle')}
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {staffCards.map((member) => {
              const curr = member.current_entry;
              const currTimer =
                curr?.status === 'In Chair'
                  ? computeLiveServiceTimer(curr.started_at, curr.total_duration_minutes, nowMs)
                  : null;
              const isBusyOrActive =
                member.availability_status === 'Busy' || Boolean(curr);

              const cardAccent =
                curr?.status === 'In Chair'
                  ? 'border-t-4 border-t-deep-sage'
                  : curr?.status === 'Called'
                    ? 'border-t-4 border-t-warm-terracotta'
                    : member.availability_status === 'On Break'
                      ? 'border-t-4 border-t-muted-rose/70'
                      : 'border-t-4 border-t-celeste-sage/40';

              return (
                <article
                  key={member.id}
                  className={`celeste-card celeste-interactive-card flex flex-col justify-between rounded-2xl border border-warm-terracotta/45 p-4 ${cardAccent}`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <StaffAvatar staff={member} size="md" />
                        <div>
                          <h3 className="font-serif text-xl font-semibold leading-tight text-charcoal-green">
                            {pick(member, 'name')}
                          </h3>
                          <p className="text-[11px] font-medium text-muted-rose">
                            {pick(member, 'role')}
                          </p>
                        </div>
                      </div>
                      <StaffAvailabilityBadge
                        availabilityStatus={member.availability_status}
                        isOnDuty={member.is_on_duty}
                      />
                    </div>

                    <p className="mt-2.5 text-xs text-charcoal-green/75">
                      {pick(member, 'speciality')}
                    </p>

                    <div
                      className={`mt-3 rounded-xl border p-3 text-xs ${
                        curr?.status === 'In Chair'
                          ? 'border-celeste-sage/30 bg-soft-sage/75'
                          : curr?.status === 'Called'
                            ? 'border-warm-terracotta bg-warm-terracotta/20'
                            : 'border-champagne/55 bg-warm-ivory'
                      }`}
                    >
                      {curr ? (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-serif text-xl font-bold text-charcoal-green">
                              {curr.token_display}
                            </span>
                            <QueueStatusBadge status={curr.status} />
                          </div>
                          <p className="mt-1 font-semibold text-charcoal-green">
                            {curr.customer_name}
                          </p>
                          <p className="mt-0.5 truncate text-charcoal-green/75">
                            {(curr.services || []).map(pickSnapshotName).join(', ')}
                          </p>
                          {currTimer && (
                            <p className="mt-1.5 font-semibold tabular-nums text-deep-sage">
                              {t('staffRemainingTime')}:{' '}
                              {formatSecondsTimer(currTimer.remainingSeconds)}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="font-medium text-charcoal-green/65">
                          {member.waiting_count ?? 0} {t('waitingSuffix')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-warm-terracotta/30 pt-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!member.can_call_next || Boolean(busyKey)}
                        onClick={() =>
                          runMutation(
                            `call-${member.id}`,
                            () => callNextByReception(member.id),
                            'Unable to call next customer.'
                          )
                        }
                        className="celeste-btn-primary flex-1 cursor-pointer rounded-xl bg-celeste-sage px-3 py-2 text-xs font-semibold text-white hover:bg-deep-sage disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {t('receptionCallNext')} ({member.waiting_count ?? 0})
                      </button>

                      {curr?.status === 'Called' && (
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() =>
                            runMutation(
                              `start-${curr.entry_id}`,
                              () => startServiceByReception(curr.entry_id),
                              'Unable to start service.'
                            )
                          }
                          className="celeste-btn-secondary cursor-pointer rounded-xl bg-soft-sage px-3 py-2 text-xs font-semibold text-deep-sage ring-1 ring-celeste-sage/25 hover:bg-warm-sand"
                        >
                          {t('receptionStartService')}
                        </button>
                      )}

                      {curr?.status === 'In Chair' && (
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() =>
                            runMutation(
                              `complete-${curr.entry_id}`,
                              () => completeServiceByReception(curr.entry_id),
                              'Unable to complete service.'
                            )
                          }
                          className="celeste-btn-primary cursor-pointer rounded-xl bg-deep-sage px-3 py-2 text-xs font-semibold text-warm-ivory hover:bg-celeste-sage"
                        >
                          {t('receptionCompleteService')}
                        </button>
                      )}
                    </div>

                    {member.is_on_duty && (
                      <button
                        type="button"
                        disabled={isBusyOrActive || Boolean(busyKey)}
                        onClick={() => {
                          const nextStatus =
                            member.availability_status === 'On Break' ? 'Available' : 'On Break';
                          runMutation(
                            `avail-${member.id}`,
                            () => updateStaffAvailabilityByReception(member.id, nextStatus),
                            'Unable to change staff availability.'
                          );
                        }}
                        className="celeste-btn-secondary w-full cursor-pointer rounded-xl border border-warm-terracotta/55 bg-warm-sand/45 px-3 py-1.5 text-[11px] font-semibold text-charcoal-green hover:bg-warm-terracotta/30 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {member.availability_status === 'On Break'
                          ? t('receptionSetAvailable')
                          : t('receptionGoBreak')}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Live Queue Table (FCFS) */}
        <section className="celeste-card-elevated overflow-hidden rounded-3xl border border-warm-terracotta/55">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-warm-terracotta/40 bg-[#FDFBF7] px-5 py-4 sm:px-6">
            <div>
              <BohoEyebrow>{t('receptionQueueEyebrow')}</BohoEyebrow>
              <h2 className="font-serif text-2xl font-semibold text-charcoal-green sm:text-3xl">
                {t('receptionQueueTitle')}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2 rounded-xl border border-champagne bg-warm-ivory px-3 py-2 transition focus-within:border-celeste-sage focus-within:bg-white">
                <Search className="h-4 w-4 text-dusty-blue" aria-hidden="true" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('receptionSearchPlaceholder')}
                  className="w-44 bg-transparent text-xs text-charcoal-green placeholder:text-charcoal-green/50 focus:outline-none sm:w-56"
                />
              </div>

              <div className="flex flex-wrap gap-1">
                {[
                  { key: 'ALL', label: t('receptionFilterAll') },
                  { key: 'Waiting', label: labelStatus('Waiting') },
                  { key: 'Called', label: labelStatus('Called') },
                  { key: 'In Chair', label: labelStatus('In Chair') },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold transition active:scale-[0.98] ${
                      statusFilter === tab.key
                        ? 'border-deep-sage bg-deep-sage text-warm-ivory shadow-2xs'
                        : 'border-warm-terracotta/45 bg-warm-sand/40 text-charcoal-green/80 hover:bg-soft-sage'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            {combinedQueue.length === 0 ? (
              <p className="py-10 text-center text-sm text-charcoal-green/65">
                {t('receptionEmptyQueue')}
              </p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-warm-terracotta/40">
                <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-warm-terracotta/45 bg-warm-sand/55 text-xs uppercase tracking-wider text-charcoal-green/70">
                      <th className="py-3 pl-4 pr-3">{t('receptionColToken')}</th>
                      <th className="py-3 px-3">{t('receptionColCustomer')}</th>
                      <th className="py-3 px-3">{t('receptionColServices')}</th>
                      <th className="py-3 px-3">{t('receptionColStylist')}</th>
                      <th className="py-3 px-3">{t('receptionColWaitTimer')}</th>
                      <th className="py-3 px-3">{t('receptionColStatus')}</th>
                      <th className="py-3 pl-3 pr-4 text-right">{t('receptionColActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-terracotta/25 bg-white">
                    {combinedQueue.map((entry) => {
                      const over60 = Boolean(entry.is_waiting_over_60_minutes);
                      const arrival =
                        entry.status === 'Called'
                          ? computeLiveArrivalCountdown(
                              entry.called_at,
                              entry.arrival_window?.window_minutes || 10,
                              nowMs
                            )
                          : null;
                      const noShowReady =
                        entry.status === 'Called' &&
                        (entry.can_mark_no_show || arrival?.isExpired);
                      const timer =
                        entry.status === 'In Chair'
                          ? computeLiveServiceTimer(
                              entry.started_at,
                              entry.total_duration_minutes,
                              nowMs
                            )
                          : null;

                      return (
                        <tr
                          key={entry.entry_id}
                          className={
                            over60
                              ? 'border-l-4 border-l-muted-rose bg-warm-terracotta/22'
                              : 'transition hover:bg-warm-ivory/80'
                          }
                        >
                          <td className="py-3.5 pl-4 pr-3 align-top">
                            <span className="font-serif text-xl font-bold tabular-nums text-charcoal-green">
                              {entry.token_display}
                            </span>
                            <span className="mt-0.5 block text-[11px] font-medium uppercase text-dusty-blue">
                              {entry.source === 'walk_in' ? t('sourceWalkIn') : t('sourceOnline')}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 align-top">
                            <p className="font-semibold text-charcoal-green">{entry.customer_name}</p>
                            <p className="mt-0.5 flex items-center gap-1 text-xs tabular-nums text-charcoal-green/70">
                              <Phone className="h-3 w-3 text-celeste-sage" aria-hidden="true" />
                              <span>{entry.customer_phone || '—'}</span>
                            </p>
                          </td>

                          <td className="py-3.5 px-3 align-top">
                            <p className="max-w-xs text-xs font-medium text-charcoal-green">
                              {(entry.services || []).map(pickSnapshotName).join(', ')}
                            </p>
                            <p className="mt-0.5 text-[11px] tabular-nums text-charcoal-green/70">
                              {formatMinutes(entry.total_duration_minutes, lang)} ·{' '}
                              <strong className="text-deep-sage">
                                {formatInr(entry.total_price_inr)}
                              </strong>
                            </p>
                          </td>

                          <td className="py-3.5 px-3 align-top">
                            <span className="font-medium text-charcoal-green">
                              {pick(entry.assigned_staff, 'name')}
                            </span>
                            {entry.queue_position > 0 && (
                              <span className="mt-0.5 block text-[11px] tabular-nums text-charcoal-green/60">
                                #{entry.queue_position}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-3 align-top text-xs tabular-nums">
                            {entry.status === 'Waiting' && (
                              <div>
                                <span className="inline-flex items-center gap-1 font-medium text-charcoal-green">
                                  <Clock className="h-3.5 w-3.5 text-celeste-sage" />
                                  {formatMinutes(entry.waited_minutes, lang)}
                                </span>
                                {over60 && (
                                  <span className="mt-1 inline-block rounded-full border border-muted-rose/40 bg-warm-terracotta/55 px-2 py-0.5 text-[10px] font-bold text-charcoal-green">
                                    {t('receptionOver60Highlight')}
                                  </span>
                                )}
                                {entry.estimated_wait_minutes !== null && (
                                  <span className="mt-0.5 block text-[11px] text-charcoal-green/65">
                                    {t('receptionEtaLabel')}: {formatMinutes(entry.estimated_wait_minutes, lang)}
                                  </span>
                                )}
                              </div>
                            )}

                            {entry.status === 'Called' && arrival && (
                              <span
                                className={`font-semibold ${
                                  arrival.isExpired ? 'text-rosewood' : 'text-deep-sage'
                                }`}
                              >
                                {formatSecondsTimer(arrival.remainingSeconds)}
                              </span>
                            )}

                            {entry.status === 'In Chair' && timer && (
                              <span className="font-semibold text-deep-sage">
                                {formatSecondsTimer(timer.elapsedSeconds)} /{' '}
                                {formatMinutes(entry.total_duration_minutes, lang)}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-3 align-top">
                            <QueueStatusBadge status={entry.status} />
                            {entry.is_customer_on_the_way && entry.status === 'Waiting' && (
                              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-celeste-sage/35 bg-soft-sage px-2 py-0.5 text-[11px] font-semibold text-deep-sage">
                                <Navigation className="h-3 w-3" aria-hidden="true" />
                                <span>{t('receptionOnTheWay')}</span>
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 pl-3 pr-4 text-right align-top">
                            <div className="inline-flex flex-wrap justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openDetails(entry.entry_id)}
                                className="celeste-btn-secondary inline-flex cursor-pointer items-center gap-1 rounded-lg border border-warm-terracotta/55 bg-warm-sand/45 px-2.5 py-1.5 text-xs font-medium text-charcoal-green hover:bg-soft-sage"
                              >
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>{t('receptionDetails')}</span>
                              </button>

                              {entry.can_correct && (
                                <button
                                  type="button"
                                  disabled={Boolean(busyKey)}
                                  onClick={() => setEditingEntry(entry)}
                                  className="celeste-btn-secondary inline-flex cursor-pointer items-center gap-1 rounded-lg border border-champagne bg-white px-2.5 py-1.5 text-xs font-medium text-charcoal-green hover:bg-soft-sage"
                                >
                                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>{t('receptionEditEntry')}</span>
                                </button>
                              )}

                              {entry.can_start_service && (
                                <button
                                  type="button"
                                  disabled={Boolean(busyKey)}
                                  onClick={() =>
                                    runMutation(
                                      `start-${entry.entry_id}`,
                                      () => startServiceByReception(entry.entry_id),
                                      'Unable to start service.'
                                    )
                                  }
                                  className="celeste-btn-primary inline-flex cursor-pointer items-center gap-1 rounded-lg bg-celeste-sage px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-deep-sage"
                                >
                                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>{t('receptionStartService')}</span>
                                </button>
                              )}

                              {entry.can_complete_service && (
                                <button
                                  type="button"
                                  disabled={Boolean(busyKey)}
                                  onClick={() =>
                                    runMutation(
                                      `complete-${entry.entry_id}`,
                                      () => completeServiceByReception(entry.entry_id),
                                      'Unable to complete service.'
                                    )
                                  }
                                  className="celeste-btn-primary inline-flex cursor-pointer items-center gap-1 rounded-lg bg-deep-sage px-2.5 py-1.5 text-xs font-semibold text-warm-ivory hover:bg-celeste-sage"
                                >
                                  <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>{t('receptionCompleteService')}</span>
                                </button>
                              )}

                              {entry.status === 'Called' && (
                                <button
                                  type="button"
                                  disabled={!noShowReady || Boolean(busyKey)}
                                  onClick={() =>
                                    setConfirmState({ open: true, type: 'noshow', entry })
                                  }
                                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dusty-blue/50 bg-dusty-blue/15 px-2.5 py-1.5 text-xs font-semibold text-charcoal-green transition hover:bg-dusty-blue hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>{t('receptionMarkNoShow')}</span>
                                </button>
                              )}

                              {entry.can_cancel && (
                                <button
                                  type="button"
                                  disabled={Boolean(busyKey)}
                                  onClick={() =>
                                    setConfirmState({ open: true, type: 'cancel', entry })
                                  }
                                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-muted-rose/45 bg-muted-rose/10 px-2.5 py-1.5 text-xs font-semibold text-rosewood transition hover:bg-muted-rose hover:text-white"
                                >
                                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>{t('cancelAction')}</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Scheduled Appointments (Today & Upcoming) */}
        <section className="celeste-card-elevated overflow-hidden rounded-3xl border border-warm-terracotta/55">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-warm-terracotta/40 bg-[#FDFBF7] px-5 py-4 sm:px-6">
            <div>
              <BohoEyebrow>{t('apptPageEyebrow')}</BohoEyebrow>
              <h2 className="font-serif text-2xl font-semibold text-charcoal-green sm:text-3xl">
                {t('receptionApptsHeading')}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2 rounded-xl border border-champagne bg-warm-ivory px-3 py-2">
                <Search className="h-4 w-4 text-dusty-blue" aria-hidden="true" />
                <input
                  type="text"
                  value={apptSearch}
                  onChange={(e) => setApptSearch(e.target.value)}
                  placeholder={t('receptionApptsSearchPlaceholder')}
                  className="w-44 bg-transparent text-xs text-charcoal-green placeholder:text-charcoal-green/50 focus:outline-none sm:w-56"
                />
              </div>
              <div className="flex gap-1">
                {['today', 'upcoming'].map((tabKey) => (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setApptTab(tabKey)}
                    className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                      apptTab === tabKey
                        ? 'border-deep-sage bg-deep-sage text-warm-ivory'
                        : 'border-warm-terracotta/45 bg-warm-sand/40 text-charcoal-green/80 hover:bg-soft-sage'
                    }`}
                  >
                    {tabKey === 'today' ? t('receptionApptsTodayTab') : t('receptionApptsUpcomingTab')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            {displayedAppointments.length === 0 ? (
              <p className="py-8 text-center text-sm text-charcoal-green/65">{t('receptionApptsEmpty')}</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-warm-terracotta/40">
                <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-warm-terracotta/45 bg-warm-sand/55 text-xs uppercase tracking-wider text-charcoal-green/70">
                      <th className="py-3 pl-4 pr-3">{t('apptLookupRefLabel')}</th>
                      <th className="py-3 px-3">{t('receptionColCustomer')}</th>
                      <th className="py-3 px-3">{t('apptDateTimeLabel')}</th>
                      <th className="py-3 px-3">{t('receptionColServices')}</th>
                      <th className="py-3 px-3">{t('receptionColStylist')}</th>
                      <th className="py-3 px-3">{t('receptionColStatus')}</th>
                      <th className="py-3 pl-3 pr-4 text-right">{t('receptionColActions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-warm-terracotta/25 bg-white">
                    {displayedAppointments.map((appt) => (
                      <tr key={appt.appointment_id} className="transition hover:bg-warm-ivory/80">
                        <td className="py-3 pl-4 pr-3 font-mono text-xs font-bold text-deep-sage">
                          {appt.reference_code}
                        </td>
                        <td className="py-3 px-3">
                          <p className="font-semibold text-charcoal-green">{appt.customer_name}</p>
                          <p className="text-xs tabular-nums text-charcoal-green/70">
                            {appt.customer_phone || '—'}
                          </p>
                        </td>
                        <td className="py-3 px-3 text-xs tabular-nums">
                          <p className="font-medium">{formatDateLabel(appt.appointment_date, lang)}</p>
                          <p className="text-charcoal-green/75">{formatTimeHhMm(appt.start_time, lang)}</p>
                        </td>
                        <td className="py-3 px-3 text-xs">
                          {(appt.services || []).map(pickSnapshotName).join(', ')}
                        </td>
                        <td className="py-3 px-3 text-xs font-medium">
                          {pick(appt.assigned_staff, 'name')}
                        </td>
                        <td className="py-3 px-3 text-xs font-semibold">
                          <span className="rounded-full border border-celeste-sage/30 bg-soft-sage px-2.5 py-0.5 text-deep-sage">
                            {appt.status}
                          </span>
                          {appt.queue_token_display && (
                            <span className="ml-1.5 text-[11px] font-bold text-charcoal-green">
                              ({appt.queue_token_display})
                            </span>
                          )}
                        </td>
                        <td className="py-3 pl-3 pr-4 text-right">
                          <div className="inline-flex flex-wrap justify-end gap-1.5">
                            {appt.can_check_in && (
                              <button
                                type="button"
                                disabled={Boolean(busyKey)}
                                onClick={() =>
                                  runMutation(
                                    `checkin-${appt.appointment_id}`,
                                    () => checkInAppointmentByReception(appt.appointment_id),
                                    'Unable to check in appointment.'
                                  )
                                }
                                className="celeste-btn-primary cursor-pointer rounded-lg bg-celeste-sage px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-deep-sage"
                              >
                                {t('receptionCheckInBtn')}
                              </button>
                            )}
                            {appt.can_mark_no_show && (
                              <button
                                type="button"
                                disabled={Boolean(busyKey)}
                                onClick={() =>
                                  runMutation(
                                    `appt-noshow-${appt.appointment_id}`,
                                    () => markAppointmentNoShowByReception(appt.appointment_id),
                                    'Unable to mark No Show.'
                                  )
                                }
                                className="cursor-pointer rounded-lg border border-dusty-blue/50 bg-dusty-blue/15 px-2.5 py-1.5 text-xs font-semibold text-charcoal-green hover:bg-dusty-blue hover:text-white"
                              >
                                {t('receptionMarkNoShow')}
                              </button>
                            )}
                            {appt.can_cancel && (
                              <button
                                type="button"
                                disabled={Boolean(busyKey)}
                                onClick={() =>
                                  setConfirmState({ open: true, type: 'cancel-appt', entry: appt })
                                }
                                className="cursor-pointer rounded-lg border border-muted-rose/45 bg-muted-rose/10 px-2.5 py-1.5 text-xs font-semibold text-rosewood hover:bg-muted-rose hover:text-white"
                              >
                                {t('cancelAction')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>

      <WalkInModal
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        services={walkInOptions.services}
        qualifications={walkInOptions.qualifications}
        staffCards={staffCards}
        maxServices={salon.max_services_per_entry || 3}
        onSubmit={async (payload) => {
          const res = await addWalkInCustomer(payload);
          showNotice('success', res?.message || 'Walk-in added.');
          await loadDashboard({ silent: true });
        }}
      />

      <CorrectEntryModal
        entry={editingEntry}
        onClose={() => setEditingEntry(null)}
        services={walkInOptions.services}
        qualifications={walkInOptions.qualifications}
        maxServices={salon.max_services_per_entry || 3}
        onSubmit={async (entryId, payload) => {
          const res = await correctEntryByReception(entryId, payload);
          showNotice('success', res?.message || 'Queue entry updated.');
          await loadDashboard({ silent: true });
        }}
      />

      <EntryDetailModal
        detail={detailState.open ? detailState.data : null}
        loading={detailState.open && detailState.loading}
        error={detailState.open ? detailState.error : ''}
        onClose={() => setDetailState({ open: false, loading: false, data: null, error: '' })}
      />

      <ConfirmModal
        open={confirmState.open}
        title={
          confirmState.type === 'noshow'
            ? t('receptionNoShowConfirmTitle')
            : confirmState.type === 'cancel-appt'
              ? t('apptCancelConfirmTitle')
              : t('receptionCancelConfirmTitle')
        }
        description={
          confirmState.entry
            ? confirmState.type === 'noshow'
              ? t('receptionNoShowConfirmDesc', { token: confirmState.entry.token_display })
              : confirmState.type === 'cancel-appt'
                ? t('apptCancelConfirmDesc', { ref: confirmState.entry.reference_code || '' })
                : t('receptionCancelConfirmDesc', {
                    token: confirmState.entry.token_display,
                    name: confirmState.entry.customer_name || '',
                  })
            : ''
        }
        cancelLabel={t('cancelAction')}
        confirmLabel={t('confirmAction')}
        onCancel={() => setConfirmState({ open: false, type: null, entry: null })}
        onConfirm={handleConfirmModal}
      />
    </div>
  );
}
