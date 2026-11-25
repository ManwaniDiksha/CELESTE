import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react';
import { LanguageSwitcher } from '../components/AppHeader.jsx';
import { BohoCornerFlourish, BohoSunMark } from '../components/BohoAccents.jsx';
import { PageError, PageLoading } from '../components/FeedbackStates.jsx';
import { RealtimeBanner } from '../components/RealtimeBanner.jsx';
import {
  QueueStatusBadge,
  StaffAvailabilityBadge,
  StaffAvatar,
} from '../components/StatusBadges.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useQueueRealtime } from '../hooks/useQueueRealtime.js';
import { getDisplayBoard } from '../services/api.js';
import {
  formatDateLabel,
  formatLiveIstClock,
  formatMinutes,
  playGentleSalonChime,
} from '../utils/formatters.js';

export default function WaitingAreaDisplayPage() {
  const { t, lang, pick } = useLanguage();

  const [display, setDisplay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clockNow, setClockNow] = useState(() => new Date());

  const seenCalledKeysRef = useRef(new Set());
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const loadDisplay = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await getDisplayBoard();
      const payload = res.data;
      setDisplay(payload);

      const currentCalledKeys = new Set(
        (payload?.called_tokens || []).map(
          (item) => `${item.token_display}:${item.called_at || ''}`
        )
      );

      if (silent && soundEnabledRef.current) {
        let hasNewCall = false;
        for (const key of currentCalledKeys) {
          if (!seenCalledKeysRef.current.has(key)) {
            hasNewCall = true;
            break;
          }
        }
        if (hasNewCall) {
          playGentleSalonChime();
        }
      }
      seenCalledKeysRef.current = currentCalledKeys;
    } catch (err) {
      setError(err.message || 'Unable to load display board.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDisplay();
  }, [loadDisplay]);

  const realtime = useQueueRealtime(() => loadDisplay({ silent: true }), { enabled: true });

  useEffect(() => {
    const timer = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen denial.
    }
  };

  if (loading && !display) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <PageLoading />
      </div>
    );
  }

  if (error && !display) {
    return (
      <div className="flex min-h-screen flex-col bg-warm-ivory">
        <PageError message={error} onRetry={() => loadDisplay()} />
      </div>
    );
  }

  const salon = display?.salon || {};
  const staffCards = display?.staff_cards || [];
  const calledTokens = display?.called_tokens || [];
  const nextFive = display?.next_waiting_tokens || [];
  const totalWaitingCount = display?.total_waiting_count ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-warm-ivory text-charcoal-green">
      {/* High-Contrast Dark Charcoal-Green TV Header */}
      <header className="border-b-2 border-warm-terracotta/65 bg-charcoal-green px-6 py-4 text-warm-ivory lg:px-10">
        <div className="mx-auto flex w-full max-w-[1680px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-warm-terracotta bg-deep-sage font-serif text-2xl font-semibold text-white"
            >
              C
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-serif text-3xl font-semibold tracking-[0.08em] text-white sm:text-4xl">
                  {salon.name || 'CELESTE'}
                </h1>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    salon.is_salon_open
                      ? 'border-warm-terracotta/50 bg-deep-sage text-warm-ivory'
                      : 'border-muted-rose bg-muted-rose/25 text-white'
                  }`}
                >
                  {salon.is_salon_open ? t('openNow') : t('closedNow')}
                </span>
              </div>
              <p className="mt-0.5 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-warm-terracotta sm:text-sm">
                <BohoSunMark className="h-3.5 w-3.5 text-warm-terracotta" />
                <span>{t('displaySubtitle')}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-2xl border border-warm-terracotta/45 bg-white/10 px-4 py-2 text-right">
              <p className="text-[11px] font-medium text-warm-terracotta">
                {formatDateLabel(salon.queue_date, lang)}
              </p>
              <p className="font-serif text-2xl font-bold tabular-nums text-white sm:text-3xl">
                {formatLiveIstClock(clockNow, true)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (next) playGentleSalonChime();
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-warm-terracotta/45 bg-white/10 px-3 py-2 text-xs font-semibold text-warm-ivory transition hover:bg-white/20"
            >
              {soundEnabled ? (
                <Volume2 className="h-4 w-4 text-warm-terracotta" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-rose" />
              )}
              <span>{soundEnabled ? t('displayEnableSound') : t('displayMuted')}</span>
            </button>

            <button
              type="button"
              onClick={toggleFullscreen}
              className="hidden cursor-pointer items-center gap-1.5 rounded-xl border border-warm-terracotta/45 bg-white/10 px-3 py-2 text-xs font-semibold text-warm-ivory transition hover:bg-white/20 sm:inline-flex"
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4 text-warm-terracotta" />
              ) : (
                <Maximize2 className="h-4 w-4 text-warm-terracotta" />
              )}
              <span>{t('displayFullscreen')}</span>
            </button>

            <LanguageSwitcher compact dark />
          </div>
        </div>
      </header>

      <RealtimeBanner status={realtime.status} onReconnect={realtime.reconnect} />

      <main className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col gap-6 px-6 py-6 lg:px-10 lg:py-8">
        {/* Highlighted Called Tokens Banner (Deep Sage + Warm Terracotta Frame) */}
        {calledTokens.length > 0 && (
          <section
            aria-label={t('displayCallingNow')}
            className="celeste-animate-in celeste-linen-sage relative overflow-hidden rounded-3xl border-2 border-warm-terracotta bg-deep-sage p-6 text-warm-ivory shadow-md"
          >
            <BohoCornerFlourish className="pointer-events-none absolute right-3 top-3 h-8 w-8 rotate-90 text-warm-terracotta/55" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-warm-terracotta bg-warm-terracotta text-charcoal-green">
                  <BellRing className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-serif text-3xl font-semibold text-white sm:text-4xl">
                    {t('displayCallingNow')}
                  </h2>
                  <p className="text-sm text-warm-ivory/85">{t('displayPleaseApproach')}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {calledTokens.map((item) => (
                <div
                  key={`${item.token_display}-${item.assigned_staff_id}`}
                  className="flex items-center justify-between rounded-2xl border-2 border-warm-terracotta bg-[#FDFBF7] px-6 py-4 text-charcoal-green shadow-sm"
                >
                  <div>
                    <span className="font-serif text-5xl font-bold tabular-nums text-charcoal-green sm:text-6xl">
                      {item.token_display}
                    </span>
                    <p className="mt-1 text-lg font-semibold text-deep-sage">
                      {lang === 'gu'
                        ? item.assigned_staff_name_gu || item.assigned_staff_name_en
                        : item.assigned_staff_name_en}
                    </p>
                  </div>
                  <QueueStatusBadge status="Called" size="lg" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Main Landscape TV Grid: Stations (Warm Sand) + Next 5 Waiting (Soft Sage) */}
        <div className="grid flex-1 gap-6 lg:grid-cols-12">
          {/* 5 Stylist Stations */}
          <section className="celeste-linen-surface flex flex-col rounded-3xl border border-warm-terracotta/55 bg-warm-sand/45 p-6 shadow-xs lg:col-span-7">
            <h2 className="font-serif text-3xl font-semibold text-charcoal-green sm:text-4xl">
              {t('displayStations')}
            </h2>

            <div className="mt-5 grid flex-1 gap-4 sm:grid-cols-2">
              {staffCards.map((member) => {
                const isCalled = member.current_entry_status === 'Called';
                const isInChair = member.current_entry_status === 'In Chair';
                return (
                  <div
                    key={member.id}
                    className={`flex items-center justify-between gap-4 rounded-2xl border p-5 shadow-xs transition ${
                      isCalled
                        ? 'border-2 border-warm-terracotta bg-[#FDFBF7]'
                        : isInChair
                          ? 'border-celeste-sage/45 bg-white'
                          : 'border-warm-terracotta/45 bg-[#FDFBF7]/90'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <StaffAvatar staff={member} size="lg" />
                      <div>
                        <p className="font-serif text-2xl font-semibold text-charcoal-green sm:text-3xl">
                          {pick(member, 'name')}
                        </p>
                        <div className="mt-1.5">
                          <StaffAvailabilityBadge
                            availabilityStatus={member.availability_status}
                            isOnDuty={member.is_on_duty}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      {member.current_token_display ? (
                        <>
                          <p className="font-serif text-5xl font-bold tabular-nums text-charcoal-green">
                            {member.current_token_display}
                          </p>
                          <div className="mt-1.5">
                            <QueueStatusBadge status={member.current_entry_status} />
                          </div>
                        </>
                      ) : (
                        <p className="text-sm font-semibold text-deep-sage/75">
                          {member.is_on_duty && member.availability_status === 'Available'
                            ? t('displayOpenSlot')
                            : '—'}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Next 5 Waiting Tokens */}
          <section className="celeste-linen-sage flex flex-col rounded-3xl border border-celeste-sage/30 bg-soft-sage/65 p-6 shadow-xs lg:col-span-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-3xl font-semibold text-charcoal-green sm:text-4xl">
                {t('displayNextFive')}
              </h2>
              <span className="rounded-full border border-celeste-sage/25 bg-white px-3.5 py-1 text-sm font-semibold text-deep-sage">
                {t('displayTotalWaiting', { count: totalWaitingCount })}
              </span>
            </div>

            {nextFive.length === 0 ? (
              <div className="mt-5 flex flex-1 items-center justify-center rounded-2xl border border-dashed border-warm-terracotta bg-[#FDFBF7] p-8 text-center">
                <p className="font-serif text-2xl text-charcoal-green/75">
                  {t('displayWaitingEmpty')}
                </p>
              </div>
            ) : (
              <div className="mt-5 flex-1 space-y-3.5">
                {nextFive.map((item, idx) => (
                  <div
                    key={`${item.token_display}-${idx}`}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-warm-terracotta/55 bg-[#FDFBF7] px-5 py-4 shadow-2xs"
                  >
                    <div className="flex items-center gap-4">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-warm-terracotta bg-warm-sand text-sm font-bold text-charcoal-green">
                        {idx + 1}
                      </span>
                      <div>
                        <span className="font-serif text-4xl font-bold tabular-nums text-charcoal-green sm:text-5xl">
                          {item.token_display}
                        </span>
                        <p className="text-base font-semibold text-deep-sage">
                          {lang === 'gu'
                            ? item.assigned_staff_name_gu || item.assigned_staff_name_en
                            : item.assigned_staff_name_en}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-rose">
                        {t('statusWaitLabel')}
                      </p>
                      <p className="font-serif text-3xl font-bold tabular-nums text-deep-sage">
                        {item.estimated_wait_minutes === null ||
                        item.estimated_wait_minutes === undefined
                          ? '—'
                          : formatMinutes(item.estimated_wait_minutes, lang)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
