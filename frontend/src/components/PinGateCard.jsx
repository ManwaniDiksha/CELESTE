import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Lock } from 'lucide-react';
import { STAFF_DISPLAY_LIST } from '../i18n/translations.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { getDemoPrefill } from '../services/api.js';
import { BohoCornerLeaf, BohoEyebrow, BohoSunburstDivider } from './BohoAccents.jsx';

export function PinGateCard({ scope, staffSlug = null, staffList = null }) {
  const { t, lang } = useLanguage();
  const { pinSession, loginPin, demoConfig } = useAuth();
  const effectiveStaffList = Array.isArray(staffList) && staffList.length > 0 ? staffList : STAFF_DISPLAY_LIST;

  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [attemptInfo, setAttemptInfo] = useState(null);

  useEffect(() => {
    if (!demoConfig?.enabled || !demoConfig?.hasPinDemo) return;
    let active = true;
    getDemoPrefill()
      .then((res) => {
        if (active && res?.data?.pin) {
          setPin((prev) => prev || res.data.pin);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [demoConfig?.enabled, demoConfig?.hasPinDemo]);

  const targetStaffObj = effectiveStaffList.find((s) => s.slug === staffSlug);
  const targetStylistName = targetStaffObj
    ? lang === 'gu'
      ? targetStaffObj.name_gu
      : targetStaffObj.name_en
    : staffSlug || '';

  const currentStaffObj = effectiveStaffList.find((s) => s.slug === pinSession.staffSlug);
  const currentStylistName = currentStaffObj
    ? lang === 'gu'
      ? currentStaffObj.name_gu
      : currentStaffObj.name_en
    : pinSession.staffSlug || '';

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!pin.trim()) {
      setErrorMessage(t('pinInputPlaceholder'));
      return;
    }

    setSubmitting(true);
    setErrorMessage('');
    setAttemptInfo(null);

    try {
      await loginPin({ pin: pin.trim(), scope, staffSlug });
      setPin('');
    } catch (err) {
      setErrorMessage(err.message || 'Authentication failed.');
      if (err.data?.data) {
        setAttemptInfo(err.data.data);
      }
      setPin('');
    } finally {
      setSubmitting(false);
    }
  };

  const wrongStaffSignedIn =
    scope === 'staff' &&
    pinSession.authenticated &&
    pinSession.scope === 'staff' &&
    pinSession.staffSlug &&
    pinSession.staffSlug !== staffSlug;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-10 sm:px-6 lg:py-16">
      <div className="celeste-card-elevated celeste-double-frame celeste-animate-in overflow-hidden rounded-3xl border border-warm-terracotta/55">
        <div className="celeste-linen-surface relative overflow-hidden border-b border-warm-terracotta/40 bg-warm-sand/60 px-6 py-5 sm:px-10">
          <BohoCornerLeaf className="absolute right-2 top-0 h-20 w-20 text-warm-terracotta/55" />
          <div className="relative flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-warm-terracotta/65 bg-soft-sage text-deep-sage">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <BohoEyebrow>CELESTE</BohoEyebrow>
              <h1 className="mt-0.5 font-serif text-3xl font-semibold text-charcoal-green">
                {scope === 'reception' ? t('pinGateReceptionTitle') : t('pinGateStaffTitle')}
              </h1>
            </div>
          </div>
          <p className="relative mt-2.5 text-sm text-charcoal-green/80">
            {scope === 'reception'
              ? t('pinGateReceptionSub')
              : t('pinGateStaffSub', { stylist: targetStylistName })}
          </p>
          <BohoSunburstDivider className="relative mt-3" />
        </div>

        <div className="p-6 sm:p-10">
          {wrongStaffSignedIn && (
            <div className="celeste-animate-in mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warm-terracotta bg-warm-sand/70 px-4 py-3 text-sm text-charcoal-green">
              <span>
                {t('pinWrongStaffBanner', {
                  current: currentStylistName,
                  target: targetStylistName,
                })}
              </span>
              <Link
                to={`/barber/${pinSession.staffSlug}`}
                className="celeste-btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                {t('pinOpenOwnWorkspace', { current: currentStylistName })}
              </Link>
            </div>
          )}

          {scope === 'staff' && (
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-rose">
                {lang === 'gu' ? 'સ્ટાઇલિસ્ટ પસંદ કરો' : 'Stylist Route'}
              </p>
              <div className="flex flex-wrap gap-2">
                {effectiveStaffList.map((member) => {
                  const active = member.slug === staffSlug;
                  return (
                    <Link
                      key={member.slug}
                      to={`/barber/${member.slug}`}
                      className={`celeste-selectable-card rounded-xl border px-3.5 py-1.5 text-xs font-semibold ${
                        active
                          ? 'border-deep-sage bg-deep-sage text-warm-ivory shadow-xs'
                          : 'border-warm-terracotta/55 bg-warm-sand/45 text-charcoal-green hover:bg-soft-sage'
                      }`}
                    >
                      {lang === 'gu' ? member.name_gu : member.name_en}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="celeste-pin-input"
                className="block text-sm font-medium text-charcoal-green"
              >
                {t('pinInputLabel')}
              </label>
              <input
                id="celeste-pin-input"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder={t('pinInputPlaceholder')}
                disabled={submitting}
                className="celeste-input mt-1.5 w-full rounded-xl px-4 py-3 text-base tracking-widest placeholder:tracking-normal placeholder:text-charcoal-green/45"
              />
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="celeste-animate-in flex items-start gap-2.5 rounded-xl border border-muted-rose/45 bg-muted-rose/12 px-4 py-3 text-sm text-rosewood"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium">{errorMessage}</p>
                  {typeof attemptInfo?.remaining_attempts === 'number' && !attemptInfo.is_locked && (
                    <p className="mt-0.5 text-xs">
                      {lang === 'gu'
                        ? `બાકી પ્રયાસો: ${attemptInfo.remaining_attempts}`
                        : `Remaining attempts: ${attemptInfo.remaining_attempts}`}
                    </p>
                  )}
                  {attemptInfo?.is_locked && attemptInfo?.retry_after_seconds && (
                    <p className="mt-0.5 text-xs">
                      {lang === 'gu'
                        ? `લગભગ ${Math.ceil(attemptInfo.retry_after_seconds / 60)} મિનિટ પછી ફરી પ્રયાસ કરો.`
                        : `Locked for approximately ${Math.ceil(attemptInfo.retry_after_seconds / 60)} minute(s).`}
                    </p>
                  )}
                </div>
              </div>
            )}

            {!errorMessage && pinSession.error && (
              <div
                role="status"
                className="celeste-animate-in flex items-start gap-2.5 rounded-xl border border-warm-terracotta/70 bg-warm-sand/70 px-4 py-3 text-sm text-charcoal-green"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rosewood" aria-hidden="true" />
                <p className="font-medium">{pinSession.error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="celeste-btn-primary w-full cursor-pointer rounded-xl px-5 py-3.5 text-sm font-semibold"
            >
              {submitting ? t('pinSigningIn') : t('pinSignInBtn')}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
