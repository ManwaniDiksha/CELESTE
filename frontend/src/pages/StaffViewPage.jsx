import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Coffee,
  LogOut,
  Navigation,
  Play,
  ShieldCheck,
  UserCheck,
  UserX,
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader.jsx';
import {
  BohoBotanicalSprig,
  BohoBranchRule,
  BohoCornerFlourish,
  BohoCornerLeaf,
  BohoSunburstDivider,
} from '../components/BohoAccents.jsx';
import { ConfirmModal } from '../components/ConfirmModal.jsx';
import { PageError, PageLoading } from '../components/FeedbackStates.jsx';
import { PinGateCard } from '../components/PinGateCard.jsx';
import { RealtimeBanner } from '../components/RealtimeBanner.jsx';
import {
  QueueStatusBadge,
  StaffAvailabilityBadge,
  StaffAvatar,
} from '../components/StatusBadges.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useQueueRealtime } from '../hooks/useQueueRealtime.js';
import { STAFF_DISPLAY_LIST, VALID_STAFF_SLUGS } from '../i18n/translations.js';
import {
  callNextByStaff,
  completeServiceByStaff,
  getHomeSummary,
  getStaffDashboard,
  markNoShowByStaff,
  startServiceByStaff,
  updateStaffAvailabilityBySelf,
} from '../services/api.js';
import {
  computeLiveArrivalCountdown,
  computeLiveServiceTimer,
  formatDateLabel,
  formatInr,
  formatMinutes,
  formatSecondsTimer,
} from '../utils/formatters.js';

export default function StaffViewPage() {
  const { name } = useParams();
  const slug = typeof name === 'string' ? name.trim().toLowerCase() : '';

  const { t, lang, pick, pickSnapshotName } = useLanguage();
  const { pinSession, refreshPinSession, invalidatePinSession, logoutPin } = useAuth();

  const [publicStaffList, setPublicStaffList] = useState(null);
  useEffect(() => {
    let active = true;
    getHomeSummary()
      .then((res) => {
        if (active && Array.isArray(res?.data?.staff) && res.data.staff.length > 0) {
          setPublicStaffList(res.data.staff);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const effectiveStaffList = publicStaffList || STAFF_DISPLAY_LIST;
  const knownSlugs = publicStaffList
    ? publicStaffList.map((s) => s.slug).filter(Boolean)
    : VALID_STAFF_SLUGS;
  const validSlug = Boolean(slug) && knownSlugs.includes(slug);

  const isMatchedStaffAuthed =
    validSlug &&
    pinSession.authenticated &&
    pinSession.scope === 'staff' &&
    pinSession.staffSlug === slug;

  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmNoShowEntry, setConfirmNoShowEntry] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const loadDashboard = useCallback(
    async ({ silent = false } = {}) => {
      if (!isMatchedStaffAuthed) return;
      if (!silent) setLoading(true);
      setError('');
      try {
        const res = await getStaffDashboard(slug);
        setDashboard(res.data);
      } catch (err) {
        if (err.status === 401) {
          invalidatePinSession(
            lang === 'gu'
              ? 'તમારું સ્ટાઇલિસ્ટ સત્ર સમાપ્ત થઈ ગયું છે અથવા અમાન્ય છે. કૃપા કરીને ફરી સાઇન ઇન કરો.'
              : 'Your stylist session expired or is no longer valid. Please sign in again.'
          );
          return;
        }
        if (err.status === 403) {
          const refreshed = await refreshPinSession();
          if (!refreshed?.authenticated) {
            invalidatePinSession(
              err.message || 'Your stylist session could not be verified. Please sign in again.'
            );
          } else if (refreshed.scope === 'staff' && refreshed.staffSlug === slug) {
            setError(err.message || 'Unable to load stylist workspace.');
          }
          return;
        }
        setError(err.message || 'Unable to load stylist workspace.');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [isMatchedStaffAuthed, slug, lang, invalidatePinSession, refreshPinSession]
  );

  useEffect(() => {
    if (isMatchedStaffAuthed) {
      loadDashboard();
    } else {
      setDashboard(null);
    }
  }, [isMatchedStaffAuthed, loadDashboard]);

  const realtime = useQueueRealtime(() => loadDashboard({ silent: true }), {
    enabled: isMatchedStaffAuthed,
    staffIdFilter: dashboard?.staff?.id || pinSession.staff?.id || null,
  });

  useEffect(() => {
    if (!isMatchedStaffAuthed) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isMatchedStaffAuthed]);

  const runAction = async (fn, fallback) => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fn();
      setFeedback({ type: 'success', message: res?.message || 'Updated.' });
      await loadDashboard({ silent: true });
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || fallback });
    } finally {
      setBusy(false);
    }
  };

  if (!validSlug) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory text-charcoal-green">
        <AppHeader />
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-12">
          <div className="celeste-card-elevated rounded-3xl border border-warm-terracotta/55 p-8 text-center">
            <h1 className="font-serif text-3xl font-semibold text-charcoal-green">
              {t('staffHeading')}
            </h1>
            <p className="mt-2 text-sm text-charcoal-green/75">
              {lang === 'gu'
                ? 'કૃપા કરીને માન્ય સ્ટાઇલિસ્ટ પસંદ કરો:'
                : 'Select a stylist workspace to continue:'}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              {effectiveStaffList.map((member) => (
                <Link
                  key={member.slug}
                  to={`/barber/${member.slug}`}
                  className="rounded-xl border border-warm-terracotta/55 bg-warm-sand/50 px-4 py-2 text-sm font-semibold text-deep-sage transition hover:bg-deep-sage hover:text-warm-ivory"
                >
                  {lang === 'gu' ? member.name_gu : member.name_en}
                </Link>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (pinSession.loading) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageLoading />
      </div>
    );
  }

  if (!isMatchedStaffAuthed) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader staffList={effectiveStaffList} />
        <PinGateCard scope="staff" staffSlug={slug} staffList={effectiveStaffList} />
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

  const staff = dashboard?.staff || {};
  const current = dashboard?.current_entry || null;
  const nextCustomer = dashboard?.next_customer || null;
  const waitingQueue = dashboard?.waiting_queue || [];

  const serviceTimer =
    current?.status === 'In Chair'
      ? computeLiveServiceTimer(current.started_at, current.total_duration_minutes, nowMs)
      : null;

  const arrivalCountdown =
    current?.status === 'Called'
      ? computeLiveArrivalCountdown(
          current.called_at,
          current.arrival_window?.window_minutes || 10,
          nowMs
        )
      : null;

  const canMarkNoShow =
    current?.status === 'Called' && (current.can_mark_no_show || arrivalCountdown?.isExpired);

  return (
    <div className="flex min-h-screen flex-col bg-warm-ivory text-charcoal-green">
      <AppHeader
        staffList={effectiveStaffList}
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

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Staff Header on Soft Sage Card */}
        <section className="celeste-linen-sage relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl border border-celeste-sage/30 bg-soft-sage/70 p-5 shadow-xs sm:p-6">
          <BohoCornerLeaf className="pointer-events-none absolute right-2 top-0 hidden h-24 w-24 text-celeste-sage/35 sm:block" />
          <div className="relative flex items-center gap-4">
            <StaffAvatar staff={staff} size="xl" />
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-serif text-3xl font-semibold text-charcoal-green sm:text-4xl">
                  {pick(staff, 'name')}
                </h1>
                <StaffAvailabilityBadge
                  availabilityStatus={staff.availability_status}
                  isOnDuty={staff.is_on_duty}
                  size="lg"
                />
              </div>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted-rose">
                {pick(staff, 'role')} · {formatDateLabel(dashboard?.queue_date, lang)}
              </p>
              <p className="mt-1 text-sm text-charcoal-green/80">{pick(staff, 'speciality')}</p>
            </div>
          </div>

          {staff.is_on_duty && (
            <div className="flex flex-wrap gap-2">
              {staff.availability_status === 'On Break' ? (
                <button
                  type="button"
                  disabled={!dashboard?.can_change_availability || busy}
                  onClick={() =>
                    runAction(
                      () => updateStaffAvailabilityBySelf(slug, 'Available'),
                      'Unable to update availability.'
                    )
                  }
                  className="celeste-btn-primary inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
                >
                  <CheckCircle2 className="h-4 w-4 text-warm-terracotta" aria-hidden="true" />
                  <span>{t('staffReturnAvailable')}</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!dashboard?.can_change_availability || busy}
                  onClick={() =>
                    runAction(
                      () => updateStaffAvailabilityBySelf(slug, 'On Break'),
                      'Unable to take a break right now.'
                    )
                  }
                  className="celeste-btn-secondary inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold"
                >
                  <Coffee className="h-4 w-4 text-muted-rose" aria-hidden="true" />
                  <span>{t('staffGoOnBreak')}</span>
                </button>
              )}
            </div>
          )}
        </section>

        {feedback && (
          <div
            role="status"
            className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium ${
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

        {/* Current Customer & Service Timer Card */}
        <section className="celeste-card-elevated celeste-double-frame overflow-hidden rounded-3xl border border-warm-terracotta/65">
          <div className="celeste-linen-surface relative flex flex-wrap items-center justify-between gap-3 overflow-hidden border-b border-warm-terracotta/45 bg-warm-sand/60 px-6 py-4 sm:px-7">
            <BohoCornerFlourish className="pointer-events-none absolute right-2 top-1 h-7 w-7 rotate-90 text-warm-terracotta/55" />
            <div className="flex items-center gap-2">
              <BohoBotanicalSprig className="h-4 w-4 text-celeste-sage" />
              <h2 className="font-serif text-2xl font-semibold text-charcoal-green sm:text-3xl">
                {t('staffCurrentCustomer')}
              </h2>
            </div>
            {dashboard?.can_call_next && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(() => callNextByStaff(slug), 'Unable to call next customer.')
                }
                className="celeste-btn-primary cursor-pointer rounded-xl px-5 py-3 text-sm font-semibold"
              >
                {t('staffCallNext')}
              </button>
            )}
          </div>

          <div className="p-6 sm:p-7">
            {!current ? (
              <div className="py-10 text-center">
                <p className="text-base text-charcoal-green/70">{t('staffNoCurrentCustomer')}</p>
                {dashboard?.can_call_next && nextCustomer && (
                  <p className="mt-3 inline-block rounded-full border border-warm-terracotta/55 bg-warm-sand/55 px-4 py-1.5 text-sm font-semibold text-deep-sage">
                    {t('staffNextUp')}: {nextCustomer.token_display} — {nextCustomer.customer_name}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-serif text-5xl font-bold tabular-nums text-charcoal-green">
                        {current.token_display}
                      </span>
                      <QueueStatusBadge status={current.status} size="lg" />
                    </div>
                    <p className="mt-2 text-xl font-semibold text-charcoal-green">
                      {current.customer_name}
                    </p>
                  </div>

                  {arrivalCountdown && (
                    <div className="rounded-2xl border border-warm-terracotta bg-warm-terracotta/25 px-4 py-3 text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-rose">
                        {t('statusArrivalRemaining')}
                      </p>
                      <p
                        className={`mt-0.5 font-serif text-3xl font-bold tabular-nums ${
                          arrivalCountdown.isExpired ? 'text-rosewood' : 'text-deep-sage'
                        }`}
                      >
                        {formatSecondsTimer(arrivalCountdown.remainingSeconds)}
                      </p>
                    </div>
                  )}
                </div>

                <BohoSunburstDivider />

                {/* Selected Services */}
                <div className="rounded-2xl border border-warm-terracotta/45 bg-warm-ivory/80 p-4">
                  <ul className="divide-y divide-warm-terracotta/25 text-sm">
                    {(current.services || []).map((svc, idx) => (
                      <li
                        key={`${svc.service_id}-${idx}`}
                        className="flex items-center justify-between gap-2 py-2 first:pt-0"
                      >
                        <span className="font-medium text-charcoal-green">
                          {pickSnapshotName(svc)}
                        </span>
                        <span className="tabular-nums text-charcoal-green/75">
                          {formatMinutes(svc.duration_minutes_snapshot, lang)} ·{' '}
                          <strong className="text-deep-sage">
                            {formatInr(svc.price_inr_snapshot)}
                          </strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Mandatory 3-part Service Timer Display */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-warm-terracotta/50 bg-warm-sand/55 p-4">
                    <p className="text-xs font-medium text-charcoal-green/75">
                      {t('staffTotalDuration')}
                    </p>
                    <p className="mt-1 font-serif text-3xl font-semibold tabular-nums text-charcoal-green">
                      {formatMinutes(current.total_duration_minutes, lang)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-celeste-sage/25 bg-soft-sage/75 p-4">
                    <p className="text-xs font-medium text-deep-sage/85">
                      {t('staffElapsedTime')}
                    </p>
                    <p className="mt-1 font-serif text-3xl font-semibold tabular-nums text-celeste-sage">
                      {serviceTimer ? formatSecondsTimer(serviceTimer.elapsedSeconds) : '00:00'}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-deep-sage bg-deep-sage p-4 text-warm-ivory shadow-xs">
                    <p className="text-xs font-medium text-warm-terracotta">
                      {t('staffRemainingTime')}
                    </p>
                    <p className="mt-1 font-serif text-3xl font-semibold tabular-nums text-white">
                      {serviceTimer
                        ? formatSecondsTimer(serviceTimer.remainingSeconds)
                        : formatMinutes(current.total_duration_minutes, lang)}
                    </p>
                  </div>
                </div>

                {serviceTimer && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-warm-sand">
                    <div
                      className="h-full rounded-full bg-deep-sage transition-all duration-500"
                      style={{ width: `${serviceTimer.progressPercent}%` }}
                    />
                  </div>
                )}

                {/* Large Touch-Friendly Service Actions */}
                <BohoBranchRule />
                <div className="flex flex-wrap gap-3 pt-1">
                  {current.can_start_service && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runAction(
                          () => startServiceByStaff(slug, current.entry_id),
                          'Unable to start service.'
                        )
                      }
                      className="celeste-btn-primary inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-semibold"
                    >
                      <Play className="h-5 w-5" aria-hidden="true" />
                      <span>{t('staffStartService')}</span>
                    </button>
                  )}

                  {current.can_complete_service && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        runAction(
                          () => completeServiceByStaff(slug, current.entry_id),
                          'Unable to complete service.'
                        )
                      }
                      className="celeste-btn-primary inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-semibold"
                    >
                      <UserCheck className="h-5 w-5 text-warm-terracotta" aria-hidden="true" />
                      <span>{t('staffMarkDone')}</span>
                    </button>
                  )}

                  {current.status === 'Called' && (
                    <button
                      type="button"
                      disabled={!canMarkNoShow || busy}
                      onClick={() => setConfirmNoShowEntry(current)}
                      className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dusty-blue/50 bg-dusty-blue/15 px-5 py-4 text-sm font-semibold text-charcoal-green transition hover:bg-dusty-blue hover:text-white active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <UserX className="h-4 w-4" aria-hidden="true" />
                      <span>{t('receptionMarkNoShow')}</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Next & Assigned Waiting Queue */}
        <section className="celeste-card rounded-3xl border border-warm-terracotta/50 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-warm-terracotta/35 pb-4">
            <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
              {t('staffWaitingList')} ({waitingQueue.length})
            </h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-dusty-blue">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>{t('staffPrivacyNote')}</span>
            </span>
          </div>

          {waitingQueue.length === 0 ? (
            <p className="py-8 text-center text-sm text-charcoal-green/65">
              {t('receptionEmptyQueue')}
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {waitingQueue.map((item, idx) => (
                <div
                  key={item.entry_id}
                  className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 ${
                    idx === 0
                      ? 'border-celeste-sage/40 bg-soft-sage/70'
                      : 'border-warm-terracotta/40 bg-warm-sand/30'
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-serif text-2xl font-bold tabular-nums text-charcoal-green">
                        {item.token_display}
                      </span>
                      <span className="text-base font-semibold text-charcoal-green">
                        {item.customer_name}
                      </span>
                      {idx === 0 && (
                        <span className="rounded-full bg-deep-sage px-2.5 py-0.5 text-[11px] font-semibold text-warm-ivory">
                          {t('staffNextUp')}
                        </span>
                      )}
                      {item.is_customer_on_the_way && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-warm-terracotta bg-[#FDFBF7] px-2.5 py-0.5 text-[11px] font-semibold text-deep-sage">
                          <Navigation className="h-3 w-3 text-celeste-sage" aria-hidden="true" />
                          <span>{t('receptionOnTheWay')}</span>
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-charcoal-green/75">
                      {(item.services || []).map(pickSnapshotName).join(', ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-semibold tabular-nums text-charcoal-green/75">
                    <Clock className="h-3.5 w-3.5 text-celeste-sage" aria-hidden="true" />
                    <span>{formatMinutes(item.total_duration_minutes, lang)}</span>
                    <span>·</span>
                    <span className="text-deep-sage">
                      ETA {formatMinutes(item.estimated_wait_minutes, lang)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <ConfirmModal
        open={Boolean(confirmNoShowEntry)}
        title={t('receptionNoShowConfirmTitle')}
        description={
          confirmNoShowEntry
            ? t('receptionNoShowConfirmDesc', { token: confirmNoShowEntry.token_display })
            : ''
        }
        cancelLabel={t('cancelAction')}
        confirmLabel={t('confirmAction')}
        loading={busy}
        onCancel={() => setConfirmNoShowEntry(null)}
        onConfirm={async () => {
          const target = confirmNoShowEntry;
          setConfirmNoShowEntry(null);
          if (!target) return;
          await runAction(
            () => markNoShowByStaff(slug, target.entry_id),
            'Unable to mark No-show.'
          );
        }}
      />
    </div>
  );
}
