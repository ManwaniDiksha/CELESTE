import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  MapPin,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { AppHeader, LanguageSwitcher } from '../components/AppHeader.jsx';
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
import { getHomeSummary, getJoinOptions } from '../services/api.js';
import {
  formatDateLabel,
  formatInr,
  formatMinutes,
  formatTimeHhMm,
} from '../utils/formatters.js';

const ORDERED_DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const UUID_EXTRACT_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export default function HomePage() {
  const { t, lang, pick, labelCategory, labelDay } = useLanguage();
  const navigate = useNavigate();

  const [homeData, setHomeData] = useState(null);
  const [joinCatalog, setJoinCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ticketInput, setTicketInput] = useState('');
  const [ticketError, setTicketError] = useState('');

  let recentTicketId = null;
  try {
    recentTicketId = window.localStorage.getItem('celeste_last_ticket_id');
  } catch {
    recentTicketId = null;
  }

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
    }
    setError('');
    try {
      const [homeRes, optionsRes] = await Promise.all([
        getHomeSummary(),
        getJoinOptions().catch(() => null),
      ]);
      setHomeData(homeRes.data);
      if (optionsRes?.data) {
        setJoinCatalog(optionsRes.data);
      }
    } catch (err) {
      setError(err.message || 'Unable to load salon information.');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const realtime = useQueueRealtime(() => loadData({ silent: true }), { enabled: true });

  const handleTrackTicket = (event) => {
    event.preventDefault();
    const match = UUID_EXTRACT_REGEX.exec(ticketInput.trim());
    if (!match) {
      setTicketError(
        lang === 'gu'
          ? 'કૃપા કરીને માન્ય ટિકિટ લિંક અથવા UUID દાખલ કરો.'
          : 'Please enter a valid ticket ID or status link.'
      );
      return;
    }
    setTicketError('');
    navigate(`/status/${match[0].toLowerCase()}`);
  };

  if (loading && !homeData) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageLoading />
      </div>
    );
  }

  if (error && !homeData) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <AppHeader />
        <PageError message={error} onRetry={() => loadData()} />
      </div>
    );
  }

  const salon = homeData?.salon || {};
  const summary = homeData?.queue_summary || {};
  const staffList = homeData?.staff || [];
  const categories = joinCatalog?.categories || {};
  const categoryNames = Object.keys(categories);

  const onlineBlockedMessage = (() => {
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

  return (
    <div className="flex min-h-screen flex-col bg-warm-ivory text-charcoal-green">
      <AppHeader salonName={salon.name || 'CELESTE'} />
      <RealtimeBanner status={realtime.status} onReconnect={realtime.reconnect} />

      <main className="flex-1">
        {/* Hero & Live Status Overview */}
        <section className="celeste-linen-surface relative overflow-hidden border-b border-warm-terracotta/50 bg-warm-ivory">
          {/* Restrained organic boho arch & botanical backdrop */}
          <div
            aria-hidden="true"
            className="celeste-boho-arch pointer-events-none absolute -top-16 right-6 h-80 w-64 border border-celeste-sage/20 bg-soft-sage/60 ring-1 ring-inset ring-warm-terracotta/25"
          />
          <div
            aria-hidden="true"
            className="celeste-boho-arch pointer-events-none absolute -bottom-20 left-4 h-64 w-56 border border-warm-terracotta/30 bg-warm-sand/70"
          />
          <BohoCornerLeaf className="pointer-events-none absolute right-4 top-4 hidden h-32 w-32 text-celeste-sage/35 lg:block" />
          <BohoCornerFlourish className="pointer-events-none absolute bottom-5 left-5 hidden h-10 w-10 text-warm-terracotta/60 lg:block" />

          <div className="relative mx-auto grid w-full max-w-[1440px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:items-center lg:gap-12 lg:px-8 lg:py-16">
            <div className="lg:col-span-7">
              <div className="flex flex-wrap items-center gap-2.5">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs font-semibold ${
                    salon.is_salon_open
                      ? 'border-celeste-sage/30 bg-soft-sage text-deep-sage'
                      : 'border-muted-rose/40 bg-muted-rose/12 text-muted-rose'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      salon.is_salon_open ? 'bg-celeste-sage' : 'bg-muted-rose'
                    }`}
                  />
                  {salon.is_salon_open ? t('openNow') : t('closedNow')}
                </span>

                <span
                  className={`inline-flex items-center rounded-full border px-3.5 py-1 text-xs font-semibold ${
                    salon.can_join_online
                      ? 'border-warm-terracotta/70 bg-warm-sand text-charcoal-green'
                      : 'border-dusty-blue/35 bg-dusty-blue/12 text-charcoal-green'
                  }`}
                >
                  {salon.can_join_online ? t('onlineOpen') : t('onlineClosed')}
                </span>

                <span className="text-xs font-medium tracking-wide text-muted-rose">
                  {formatDateLabel(salon.queue_date, lang)}
                </span>
              </div>

              <BohoSunburstDivider className="mt-5" />

              <h1 className="mt-4 font-serif text-4xl font-semibold leading-[1.08] tracking-tight text-charcoal-green sm:text-5xl lg:text-6xl">
                {t('homeHeadline')}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-charcoal-green/80 sm:text-lg">
                {t('homeSubcopy')}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3.5">
                {salon.can_join_online ? (
                  <Link
                    to="/join"
                    className="celeste-btn-primary group inline-flex items-center gap-2.5 rounded-xl px-7 py-3.5 text-sm font-semibold"
                  >
                    <span>{t('homeJoinCta')}</span>
                    <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="inline-flex cursor-not-allowed items-center gap-2.5 rounded-xl border border-warm-terracotta/60 bg-warm-sand/70 px-7 py-3.5 text-sm font-semibold text-charcoal-green/60"
                  >
                    <span>{t('homeJoinCta')}</span>
                  </span>
                )}

                <Link
                  to="/appointments"
                  className="celeste-btn-secondary inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold"
                >
                  <CalendarClock className="h-4 w-4 text-deep-sage" aria-hidden="true" />
                  <span>{t('homeBookApptCta')}</span>
                </Link>

                {recentTicketId && (
                  <Link
                    to={`/status/${recentTicketId}`}
                    className="celeste-btn-secondary inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold"
                  >
                    <CheckCircle2 className="h-4 w-4 text-celeste-sage" aria-hidden="true" />
                    <span>{t('homeOpenRecentTicket')}</span>
                  </Link>
                )}
              </div>

              {onlineBlockedMessage && (
                <p className="celeste-animate-in mt-4 max-w-2xl rounded-xl border border-warm-terracotta/70 bg-warm-sand/70 px-4 py-3 text-sm font-medium text-charcoal-green">
                  {onlineBlockedMessage}
                </p>
              )}

              {/* Quick ticket lookup */}
              <form
                onSubmit={handleTrackTicket}
                className="celeste-card mt-7 flex max-w-xl flex-col gap-2 rounded-2xl border border-warm-terracotta/60 p-2.5 transition focus-within:border-celeste-sage sm:flex-row sm:items-center"
              >
                <div className="flex flex-1 items-center gap-2.5 px-2.5">
                  <Search className="h-4 w-4 shrink-0 text-dusty-blue" aria-hidden="true" />
                  <input
                    type="text"
                    value={ticketInput}
                    onChange={(e) => setTicketInput(e.target.value)}
                    placeholder={t('homeTrackPlaceholder')}
                    aria-label={t('homeTrackPrompt')}
                    className="w-full bg-transparent py-1.5 text-sm text-charcoal-green placeholder:text-charcoal-green/50 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="celeste-btn-primary cursor-pointer rounded-xl px-4 py-2.5 text-xs font-semibold"
                >
                  {t('homeTrackButton')}
                </button>
              </form>
              {ticketError && <p className="mt-1.5 text-xs font-medium text-rosewood">{ticketError}</p>}
            </div>

            {/* Live Salon Snapshot Card */}
            <div className="lg:col-span-5">
              <div className="celeste-card-elevated celeste-double-frame overflow-hidden rounded-3xl border border-warm-terracotta/65">
                <div className="celeste-linen-sage relative flex items-center justify-between overflow-hidden border-b border-warm-terracotta/45 bg-deep-sage px-6 py-5 text-warm-ivory">
                  <BohoCornerLeaf className="pointer-events-none absolute right-10 top-0 h-20 w-20 text-warm-terracotta/40" />
                  <div className="relative">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-warm-terracotta">
                      {salon.name || 'CELESTE'}
                    </p>
                    <h2 className="mt-1 font-serif text-2xl font-semibold text-white">
                      {lang === 'gu' ? 'હાલની કતારની સ્થિતિ' : 'Live Studio Snapshot'}
                    </h2>
                  </div>
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-warm-terracotta/50 bg-white/10">
                    <CalendarClock className="h-5 w-5 text-warm-terracotta" aria-hidden="true" />
                  </div>
                </div>

                <div className="p-6 sm:p-7">
                  <dl className="grid grid-cols-2 gap-3.5">
                    <div className="rounded-2xl border border-celeste-sage/25 bg-soft-sage/75 p-4 transition-colors hover:border-celeste-sage/50">
                      <dt className="text-xs font-medium text-deep-sage/85">
                        {t('homeWaitingCount')}
                      </dt>
                      <dd className="mt-1 font-serif text-3xl font-semibold tabular-nums text-charcoal-green">
                        {summary.waiting_count ?? 0}
                      </dd>
                    </div>

                    <div className="rounded-2xl border border-warm-terracotta/65 bg-warm-sand/65 p-4 transition-colors hover:border-warm-terracotta">
                      <dt className="text-xs font-medium text-charcoal-green/75">
                        {t('homeApproxWait')}
                      </dt>
                      <dd className="mt-1 font-serif text-3xl font-semibold tabular-nums text-deep-sage">
                        {summary.approximate_wait_minutes === null ||
                        summary.approximate_wait_minutes === undefined
                          ? '—'
                          : summary.approximate_wait_minutes === 0
                            ? lang === 'gu'
                              ? 'તૈયાર'
                              : 'No wait'
                            : formatMinutes(summary.approximate_wait_minutes, lang)}
                      </dd>
                    </div>

                    <div className="rounded-2xl border border-champagne/65 bg-warm-ivory p-4 transition-colors hover:border-warm-terracotta/70">
                      <dt className="text-xs font-medium text-charcoal-green/70">
                        {t('homeInChairCount')}
                      </dt>
                      <dd className="mt-1 font-serif text-2xl font-semibold tabular-nums text-charcoal-green">
                        {summary.in_chair_count ?? 0}
                      </dd>
                    </div>

                    <div className="rounded-2xl border border-dusty-blue/35 bg-dusty-blue/10 p-4 transition-colors hover:border-dusty-blue/60">
                      <dt className="text-xs font-medium text-charcoal-green/70">
                        {t('homeOnlineSlots')}
                      </dt>
                      <dd className="mt-1 font-serif text-2xl font-semibold tabular-nums text-charcoal-green">
                        {salon.remaining_online_slots ?? 0}
                        <span className="ml-1 text-sm font-normal text-charcoal-green/55">
                          / {salon.daily_online_capacity ?? 30}
                        </span>
                      </dd>
                    </div>
                  </dl>

                  <BohoBranchRule className="mt-5" />

                  <div className="mt-4 flex items-center justify-between rounded-2xl border border-warm-terracotta/50 bg-warm-sand/55 px-4 py-3 text-sm">
                    <div className="flex items-center gap-2 font-medium text-charcoal-green">
                      <Clock className="h-4 w-4 shrink-0 text-deep-sage" aria-hidden="true" />
                      <span>{t('homeTodayHours')}</span>
                    </div>
                    <span className="font-semibold tabular-nums text-deep-sage">
                      {salon.today_open && salon.today_close
                        ? `${formatTimeHhMm(salon.today_open, lang)} – ${formatTimeHhMm(
                            salon.today_close,
                            lang
                          )}`
                        : t('closedNow')}
                    </span>
                  </div>

                  {(summary.waiting_count ?? 0) === 0 && (
                    <p className="mt-4 text-xs leading-relaxed text-deep-sage">
                      {t('homeNoWaitingEmpty')}
                    </p>
                  )}
                  {!summary.any_staff_available && (summary.on_duty_staff_count ?? 0) > 0 && (
                    <p className="mt-2 text-xs leading-relaxed text-muted-rose">
                      {t('homeNoStaffAvail')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Staff Availability Section on Warm Sand Band */}
        <section className="celeste-linen-surface border-b border-warm-terracotta/35 bg-warm-sand/45">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-12 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <BohoEyebrow>{t('homeStylistsEyebrow')}</BohoEyebrow>
                <h2 className="mt-1.5 flex items-center gap-2.5 font-serif text-3xl font-semibold text-charcoal-green sm:text-4xl">
                  <span>{t('homeTeamHeading')}</span>
                </h2>
                <p className="mt-1.5 text-sm text-charcoal-green/75 sm:text-base">
                  {t('homeTeamSub')}
                </p>
              </div>
              {salon.can_join_online && (
                <Link
                  to="/join"
                  className="celeste-btn-secondary group inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold"
                >
                  <span>{t('homeJoinCta')}</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              )}
            </div>

            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {staffList.map((member) => (
                <article
                  key={member.id}
                  className="celeste-card celeste-interactive-card relative flex flex-col justify-between overflow-hidden rounded-2xl border border-warm-terracotta/55 p-5"
                >
                  <BohoCornerFlourish className="pointer-events-none absolute -right-1 -bottom-1 h-7 w-7 rotate-180 text-warm-terracotta/45" />
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <StaffAvatar staff={member} size="lg" />
                      <StaffAvailabilityBadge
                        availabilityStatus={member.availability_status}
                        isOnDuty={member.is_on_duty}
                      />
                    </div>
                    <h3 className="mt-4 font-serif text-2xl font-semibold text-charcoal-green">
                      {pick(member, 'name')}
                    </h3>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-rose">
                      {pick(member, 'role')}
                    </p>
                    <p className="mt-2.5 text-sm leading-relaxed text-charcoal-green/80">
                      {pick(member, 'speciality')}
                    </p>
                  </div>

                  <div className="relative mt-5 flex items-center justify-between border-t border-warm-terracotta/35 pt-3 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-medium text-charcoal-green/75">
                      <Users className="h-3.5 w-3.5 text-celeste-sage" aria-hidden="true" />
                      <span className="tabular-nums">
                        {member.waiting_count ?? 0} {t('waitingSuffix')}
                      </span>
                    </span>

                    {salon.can_join_online &&
                      member.is_on_duty &&
                      member.availability_status !== 'On Break' && (
                        <Link
                          to={`/join?staff=${member.id}`}
                          className="rounded-lg border border-celeste-sage/20 bg-soft-sage px-2.5 py-1 font-semibold text-deep-sage transition hover:bg-celeste-sage hover:text-white active:scale-95"
                        >
                          {lang === 'gu' ? 'પસંદ કરો' : 'Book'}
                        </Link>
                      )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Service Menu Preview on Soft Sage Band */}
        {categoryNames.length > 0 && (
          <section className="celeste-linen-sage border-b border-celeste-sage/25 bg-soft-sage/60">
            <div className="mx-auto w-full max-w-[1440px] px-4 py-12 sm:px-6 lg:px-8">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <BohoEyebrow className="!text-deep-sage">{t('homeServicesEyebrow')}</BohoEyebrow>
                  <h2 className="mt-1.5 font-serif text-3xl font-semibold text-charcoal-green sm:text-4xl">
                    {t('homeServicesHeading')}
                  </h2>
                  <p className="mt-1.5 text-sm text-charcoal-green/80 sm:text-base">
                    {t('homeServicesSub')}
                  </p>
                </div>
                <Link
                  to="/join"
                  className="celeste-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
                >
                  <Sparkles className="h-4 w-4 text-warm-terracotta" aria-hidden="true" />
                  <span>{t('homeJoinCta')}</span>
                </Link>
              </div>

              <div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                {categoryNames.map((catKey) => {
                  const items = categories[catKey] || [];
                  return (
                    <div
                      key={catKey}
                      className="celeste-card celeste-interactive-card relative flex flex-col overflow-hidden rounded-2xl border border-celeste-sage/25 p-5"
                    >
                      <BohoCornerFlourish className="pointer-events-none absolute right-2 top-2 h-7 w-7 rotate-90 text-warm-terracotta/55" />
                      <div className="flex items-center justify-between border-b border-warm-terracotta/45 pb-3 pr-6">
                        <h3 className="font-serif text-2xl font-semibold text-charcoal-green">
                          {labelCategory(catKey)}
                        </h3>
                        <span className="rounded-full border border-warm-terracotta/65 bg-warm-sand px-2.5 py-0.5 text-xs font-semibold tabular-nums text-charcoal-green">
                          {items.length}
                        </span>
                      </div>

                      <ul className="mt-3 flex-1 divide-y divide-warm-terracotta/25 text-sm">
                        {items.slice(0, 5).map((svc) => (
                          <li
                            key={svc.id}
                            className="flex items-center justify-between gap-3 py-2.5"
                          >
                            <span className="font-medium text-charcoal-green">{pick(svc, 'name')}</span>
                            <span className="shrink-0 text-xs tabular-nums text-charcoal-green/75">
                              {formatMinutes(svc.duration_minutes, lang)} ·{' '}
                              <strong className="text-deep-sage">{formatInr(svc.price_inr)}</strong>
                            </span>
                          </li>
                        ))}
                      </ul>

                      <Link
                        to={`/join?category=${encodeURIComponent(catKey)}`}
                        className="group mt-4 inline-flex items-center justify-between rounded-xl border border-warm-terracotta/50 bg-warm-sand/55 px-3.5 py-2.5 text-xs font-semibold text-deep-sage transition hover:bg-deep-sage hover:text-warm-ivory active:scale-[0.99]"
                      >
                        <span>
                          {lang === 'gu'
                            ? `બધી ${items.length} સેવાઓ જુઓ`
                            : `Select from ${items.length} services`}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* How the Queue Works */}
        <section className="mx-auto w-full max-w-[1440px] px-4 py-12 sm:px-6 lg:px-8">
          <BohoSunburstDivider />
          <h2 className="mt-3 font-serif text-3xl font-semibold text-charcoal-green sm:text-4xl">
            {t('homeHowItWorks')}
          </h2>

          <div className="mt-7 grid gap-5 md:grid-cols-3">
            {[
              { num: '01', title: t('homeStep1Title'), desc: t('homeStep1Desc') },
              { num: '02', title: t('homeStep2Title'), desc: t('homeStep2Desc') },
              { num: '03', title: t('homeStep3Title'), desc: t('homeStep3Desc') },
            ].map((step) => (
              <div
                key={step.num}
                className="celeste-card celeste-interactive-card relative overflow-hidden rounded-2xl border border-warm-terracotta/55 border-t-2 border-t-warm-terracotta p-6"
              >
                <BohoCornerFlourish className="pointer-events-none absolute -bottom-1 -right-1 h-8 w-8 rotate-180 text-warm-terracotta/45" />
                <div className="flex items-center justify-between">
                  <span className="font-serif text-4xl font-semibold text-muted-rose/85">
                    {step.num}
                  </span>
                  <BohoBotanicalSprig className="h-5 w-5 text-warm-terracotta/85" />
                </div>
                <h3 className="mt-2 text-lg font-semibold text-charcoal-green">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-charcoal-green/75">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer with Weekly Hours & Language Control */}
      <footer className="border-t border-warm-terracotta/50 bg-warm-sand/50">
        <div className="mx-auto grid w-full max-w-[1440px] gap-8 px-4 py-10 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-5">
            <p className="font-serif text-2xl font-semibold tracking-wider text-charcoal-green">
              {salon.name || 'CELESTE'}
            </p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-rose">
              {t('brandSubtitle')}
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm text-charcoal-green/85">
              <MapPin className="h-4 w-4 shrink-0 text-celeste-sage" aria-hidden="true" />
              <span>{t('homeAddress')}</span>
            </p>
            <p className="mt-2 text-xs text-charcoal-green/65">{t('homeHoursNote')}</p>
            <div className="mt-5">
              <LanguageSwitcher />
            </div>
          </div>

          <div className="lg:col-span-7">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-rose">
              {t('homeHoursHeading')}
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ORDERED_DAY_KEYS.map((dayKey) => {
                const dayHours = salon.operating_hours?.[dayKey];
                const isToday = salon.day_key === dayKey;
                return (
                  <div
                    key={dayKey}
                    className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs ${
                      isToday
                        ? 'border-celeste-sage/45 bg-soft-sage font-semibold text-deep-sage'
                        : 'border-warm-terracotta/45 bg-[#FDFBF7] text-charcoal-green/85'
                    }`}
                  >
                    <span>{labelDay(dayKey)}</span>
                    <span className="tabular-nums">
                      {dayHours?.open && dayHours?.close
                        ? `${formatTimeHhMm(dayHours.open, lang)} – ${formatTimeHhMm(
                            dayHours.close,
                            lang
                          )}`
                        : t('closedNow')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
