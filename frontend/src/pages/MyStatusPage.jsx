import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  BellRing,
  CheckCircle2,
  Clock,
  Copy,
  Navigation,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { AppHeader } from '../components/AppHeader.jsx';
import {
  BohoBranchRule,
  BohoCornerFlourish,
  BohoCornerLeaf,
  BohoEyebrow,
  BohoSunburstDivider,
} from '../components/BohoAccents.jsx';
import { ConfirmModal } from '../components/ConfirmModal.jsx';
import { PageError, PageLoading } from '../components/FeedbackStates.jsx';
import { RealtimeBanner } from '../components/RealtimeBanner.jsx';
import { QueueStatusBadge, StaffAvatar } from '../components/StatusBadges.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useQueueRealtime } from '../hooks/useQueueRealtime.js';
import {
  acknowledgeStartComing,
  cancelCustomerQueue,
  getTicketStatus,
} from '../services/api.js';
import {
  computeLiveArrivalCountdown,
  computeLiveServiceTimer,
  formatDateLabel,
  formatInr,
  formatIsoTime,
  formatMinutes,
  formatSecondsTimer,
} from '../utils/formatters.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function MyStatusPage() {
  const { id } = useParams();
  const location = useLocation();
  const { t, lang, pick, pickSnapshotName } = useLanguage();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionFeedback, setActionFeedback] = useState('');
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const normalizedId = typeof id === 'string' ? id.trim().toLowerCase() : '';
  const idValid = UUID_REGEX.test(normalizedId);

  const loadTicket = useCallback(
    async ({ silent = false } = {}) => {
      if (!idValid) {
        setError(t('statusNotFound'));
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      setError('');
      try {
        const res = await getTicketStatus(normalizedId);
        setTicket(res.data);
        try {
          window.localStorage.setItem('celeste_last_ticket_id', normalizedId);
        } catch {
          // Ignore storage errors.
        }
      } catch (err) {
        setError(err.status === 404 ? t('statusNotFound') : err.message || t('statusNotFound'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [idValid, normalizedId, t]
  );

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  const realtime = useQueueRealtime(() => loadTicket({ silent: true }), {
    enabled: idValid,
    staffIdFilter: ticket?.assigned_staff?.id || null,
  });

  useEffect(() => {
    if (!ticket || (ticket.status !== 'Called' && ticket.status !== 'In Chair')) {
      return undefined;
    }
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [ticket]);

  const handleStartComing = async () => {
    setActionBusy(true);
    setActionFeedback('');
    try {
      await acknowledgeStartComing(normalizedId);
      setActionFeedback(t('statusStartComingDone'));
      await loadTicket({ silent: true });
    } catch (err) {
      setActionFeedback(err.message || 'Unable to update status.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmCancel = async () => {
    setActionBusy(true);
    setActionFeedback('');
    try {
      await cancelCustomerQueue(normalizedId);
      setCancelModalOpen(false);
      await loadTicket({ silent: true });
    } catch (err) {
      setActionFeedback(err.message || 'Unable to cancel queue entry.');
      setCancelModalOpen(false);
    } finally {
      setActionBusy(false);
    }
  };

  const copyTicketLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(false);
    }
  };

  if (loading && !ticket) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageLoading />
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageError message={error} onRetry={idValid ? () => loadTicket() : undefined} />
      </div>
    );
  }

  const stylistName = pick(ticket?.assigned_staff, 'name');
  const arrivalCountdown =
    ticket?.status === 'Called'
      ? computeLiveArrivalCountdown(
          ticket.arrival_window?.called_at || ticket.called_at,
          ticket.arrival_window?.window_minutes || 10,
          nowMs
        )
      : null;

  const serviceTimer =
    ticket?.status === 'In Chair'
      ? computeLiveServiceTimer(ticket.started_at, ticket.total_duration_minutes, nowMs)
      : null;

  return (
    <div className="flex min-h-screen flex-col bg-warm-ivory text-charcoal-green">
      <AppHeader />
      <RealtimeBanner status={realtime.status} onReconnect={realtime.reconnect} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {location.state?.justJoined && ticket?.status === 'Waiting' && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-celeste-sage/35 bg-soft-sage px-5 py-3.5 text-sm font-medium text-deep-sage shadow-2xs">
            <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>
              {lang === 'gu'
                ? `તમારું ટોકન ${ticket.token_display} બની ગયું છે. આ પેજ પર લાઇવ સ્થિતિ આપમેળે અપડેટ થશે.`
                : `Your queue token ${ticket.token_display} is confirmed. This page updates automatically.`}
            </span>
          </div>
        )}

        {/* Primary Ticket Card with Warm Sand Masthead */}
        <section className="celeste-card-elevated celeste-double-frame overflow-hidden rounded-3xl border border-warm-terracotta/70">
          <div className="celeste-linen-surface relative flex flex-wrap items-start justify-between gap-4 overflow-hidden border-b border-warm-terracotta/50 bg-warm-sand/60 px-6 py-6 sm:px-8">
            <BohoCornerLeaf className="pointer-events-none absolute right-2 top-0 h-28 w-28 text-warm-terracotta/60" />
            <BohoCornerFlourish className="pointer-events-none absolute bottom-2 left-3 h-7 w-7 rotate-270 text-muted-rose/45" />
            <div className="relative">
              <BohoEyebrow>
                {t('statusHeading')} · {formatDateLabel(ticket.queue_date, lang)}
              </BohoEyebrow>
              <div className="mt-2.5 flex flex-wrap items-center gap-4">
                <span className="font-serif text-5xl font-bold tracking-tight tabular-nums text-charcoal-green sm:text-6xl">
                  {ticket.token_display}
                </span>
                <QueueStatusBadge status={ticket.status} size="lg" />
              </div>
              <p className="mt-2.5 text-base font-semibold text-charcoal-green">
                {ticket.customer_name}
                <span className="ml-2 text-xs font-normal text-charcoal-green/65">
                  ({t('statusJoinedAt')} {formatIsoTime(ticket.joined_at, lang)})
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={copyTicketLink}
              className="celeste-btn-secondary relative inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold"
            >
              <Copy className="h-3.5 w-3.5 text-deep-sage" aria-hidden="true" />
              <span>
                {copiedLink
                  ? lang === 'gu'
                    ? 'લિંક કોપી થઈ'
                    : 'Link copied'
                  : lang === 'gu'
                    ? 'ટિકિટ લિંક કોપી કરો'
                    : 'Copy ticket link'}
              </span>
            </button>
          </div>

          <div className="p-6 sm:p-8">
            {/* Status-Specific Live Notification Banners */}
            {ticket.status === 'Called' && (
              <div className="celeste-animate-in rounded-2xl border-2 border-warm-terracotta bg-warm-terracotta/25 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-deep-sage text-warm-terracotta shadow-xs">
                      <BellRing className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="font-serif text-2xl font-semibold text-charcoal-green sm:text-3xl">
                        {t('statusCalledHeading')}
                      </h2>
                      <p className="mt-1 text-sm text-charcoal-green/85">
                        {t('statusCalledDesc', {
                          stylist: stylistName,
                          window: ticket.arrival_window?.window_minutes || 10,
                        })}
                      </p>
                    </div>
                  </div>

                  {arrivalCountdown && (
                    <div className="rounded-2xl border border-warm-terracotta bg-[#FDFBF7] px-4 py-3 text-right shadow-2xs">
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

                {arrivalCountdown?.isExpired && (
                  <p className="mt-3 text-sm font-semibold text-rosewood">
                    {t('statusArrivalExpired')}
                  </p>
                )}
              </div>
            )}

            {ticket.status === 'In Chair' && (
              <div className="celeste-animate-in celeste-linen-sage rounded-2xl border border-celeste-sage/35 bg-soft-sage/75 p-5 sm:p-6">
                <div className="flex items-center gap-2.5 text-deep-sage">
                  <Sparkles className="h-5 w-5 text-deep-sage" aria-hidden="true" />
                  <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
                    {t('statusInChairHeading')}
                  </h2>
                </div>
                <p className="mt-1 text-sm text-charcoal-green/80">
                  {t('statusInChairDesc', { stylist: stylistName })}
                </p>

                {serviceTimer && (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border border-warm-terracotta/45 bg-warm-sand/65 p-3.5">
                        <p className="text-xs text-charcoal-green/70">{t('staffTotalDuration')}</p>
                        <p className="mt-1 font-serif text-2xl font-semibold tabular-nums text-charcoal-green">
                          {formatMinutes(ticket.total_duration_minutes, lang)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-celeste-sage/25 bg-[#FDFBF7] p-3.5">
                        <p className="text-xs text-charcoal-green/70">{t('statusElapsed')}</p>
                        <p className="mt-1 font-serif text-2xl font-semibold tabular-nums text-celeste-sage">
                          {formatSecondsTimer(serviceTimer.elapsedSeconds)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-deep-sage bg-deep-sage p-3.5 text-warm-ivory">
                        <p className="text-xs text-warm-ivory/80">{t('statusRemaining')}</p>
                        <p className="mt-1 font-serif text-2xl font-semibold tabular-nums text-white">
                          {formatSecondsTimer(serviceTimer.remainingSeconds)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/80">
                      <div
                        className="h-full rounded-full bg-deep-sage transition-all duration-500"
                        style={{ width: `${serviceTimer.progressPercent}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {ticket.status === 'Waiting' && (
              <>
                <dl className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-celeste-sage/25 bg-soft-sage/65 p-4">
                    <dt className="text-xs font-medium text-deep-sage/80">
                      {t('statusPositionLabel')}
                    </dt>
                    <dd className="mt-1 font-serif text-4xl font-semibold tabular-nums text-charcoal-green">
                      #{ticket.queue_position ?? '—'}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-warm-terracotta/50 bg-warm-sand/55 p-4">
                    <dt className="text-xs font-medium text-charcoal-green/70">
                      {t('statusAheadLabel')}
                    </dt>
                    <dd className="mt-1 font-serif text-4xl font-semibold tabular-nums text-charcoal-green">
                      {ticket.customers_ahead ?? 0}
                    </dd>
                  </div>
                  <div className="rounded-2xl border border-dusty-blue/35 bg-dusty-blue/12 p-4">
                    <dt className="text-xs font-medium text-charcoal-green/70">
                      {t('statusWaitLabel')}
                    </dt>
                    <dd className="mt-1 font-serif text-4xl font-semibold tabular-nums text-deep-sage">
                      {ticket.estimated_wait_minutes === null ||
                      ticket.estimated_wait_minutes === undefined
                        ? '—'
                        : formatMinutes(ticket.estimated_wait_minutes, lang)}
                    </dd>
                  </div>
                </dl>

                {/* Position-2 Start Coming section */}
                {(ticket.can_start_coming || ticket.start_coming_at) && (
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-warm-terracotta bg-soft-sage/85 p-5 shadow-2xs">
                    <div className="flex items-start gap-3">
                      <Navigation className="mt-1 h-5 w-5 shrink-0 text-deep-sage" aria-hidden="true" />
                      <div>
                        <h2 className="text-base font-semibold text-charcoal-green">
                          {ticket.start_coming_at
                            ? t('statusStartComingDone')
                            : t('statusStartComingHeading')}
                        </h2>
                        <p className="mt-0.5 text-sm text-charcoal-green/80">
                          {ticket.start_coming_at
                            ? `${t('statusJoinedAt')}: ${formatIsoTime(ticket.start_coming_at, lang)}`
                            : t('statusStartComingDesc')}
                        </p>
                      </div>
                    </div>

                    {ticket.can_start_coming && !ticket.start_coming_at && (
                      <button
                        type="button"
                        disabled={actionBusy}
                        onClick={handleStartComing}
                        className="celeste-btn-primary cursor-pointer rounded-xl px-5 py-3 text-sm font-semibold"
                      >
                        {t('statusStartComingBtn')}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {['Done', 'Cancelled', 'No-show'].includes(ticket.status) && (
              <div
                className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 ${
                  ticket.status === 'Done'
                    ? 'border-celeste-sage/35 bg-soft-sage/80'
                    : 'border-muted-rose/40 bg-muted-rose/10'
                }`}
              >
                <div>
                  <h2 className="font-serif text-2xl font-semibold text-charcoal-green">
                    {ticket.status === 'Done'
                      ? t('statusDoneHeading')
                      : ticket.status === 'Cancelled'
                        ? t('statusCancelledHeading')
                        : t('statusNoShowHeading')}
                  </h2>
                  <p className="mt-1 text-sm text-charcoal-green/80">
                    {ticket.status === 'Done'
                      ? t('statusDoneDesc')
                      : ticket.status === 'Cancelled'
                        ? t('statusCancelledDesc')
                        : t('statusNoShowDesc')}
                  </p>
                </div>
                <Link
                  to="/join"
                  className="rounded-xl bg-celeste-sage px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-deep-sage"
                >
                  {t('statusRejoinBtn')}
                </Link>
              </div>
            )}

            {actionFeedback && (
              <p className="mt-4 rounded-xl border border-celeste-sage/25 bg-soft-sage px-4 py-2.5 text-sm font-medium text-deep-sage">
                {actionFeedback}
              </p>
            )}

            <BohoSunburstDivider className="mt-8" />

            {/* Stylist & Services Breakdown */}
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-rose">
                  {t('statusAssignedStylist')}
                </h3>
                <div className="celeste-interactive-card mt-3 flex items-center gap-3.5 rounded-2xl border border-warm-terracotta/50 bg-warm-sand/45 p-4">
                  <StaffAvatar staff={ticket.assigned_staff} size="lg" />
                  <div>
                    <p className="font-serif text-2xl font-semibold text-charcoal-green">
                      {stylistName}
                    </p>
                    <p className="text-xs font-medium text-dusty-blue">
                      {pick(ticket.assigned_staff, 'role')}
                    </p>
                    <p className="mt-0.5 text-xs text-charcoal-green/75">
                      {pick(ticket.assigned_staff, 'speciality')}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-rose">
                  {t('statusServicesSelected')}
                </h3>
                <div className="mt-3 rounded-2xl border border-warm-terracotta/50 bg-warm-ivory/85 p-4">
                  <ul className="divide-y divide-warm-terracotta/25 text-sm">
                    {(ticket.services || []).map((svc, idx) => (
                      <li
                        key={`${svc.service_id}-${idx}`}
                        className="flex items-center justify-between gap-2 py-2 first:pt-0"
                      >
                        <span className="font-medium text-charcoal-green">
                          {pickSnapshotName(svc)}
                        </span>
                        <span className="tabular-nums text-charcoal-green/75">
                          {formatMinutes(svc.duration_minutes_snapshot, lang)} ·{' '}
                          <strong className="text-deep-sage">{formatInr(svc.price_inr_snapshot)}</strong>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <BohoBranchRule className="mt-3" />
                  <div className="mt-3 flex items-center justify-between text-sm font-semibold">
                    <span className="inline-flex items-center gap-1.5 text-charcoal-green/75">
                      <Clock className="h-4 w-4 text-celeste-sage" aria-hidden="true" />
                      <span className="tabular-nums">
                        {formatMinutes(ticket.total_duration_minutes, lang)}
                      </span>
                    </span>
                    <span className="font-serif text-xl font-bold tabular-nums text-deep-sage">
                      {formatInr(ticket.total_price_inr)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {ticket.can_cancel && (
              <div className="mt-8 flex justify-end border-t border-warm-terracotta/35 pt-5">
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => setCancelModalOpen(true)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-muted-rose/50 bg-muted-rose/10 px-4 py-2.5 text-sm font-semibold text-rosewood transition hover:bg-muted-rose hover:text-white disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  <span>{t('statusCancelBtn')}</span>
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      <ConfirmModal
        open={cancelModalOpen}
        title={t('statusCancelModalTitle')}
        description={t('statusCancelModalDesc')}
        cancelLabel={t('statusCancelModalKeep')}
        confirmLabel={t('statusCancelModalConfirm')}
        loading={actionBusy}
        onCancel={() => setCancelModalOpen(false)}
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
}
