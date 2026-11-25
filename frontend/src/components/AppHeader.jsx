import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Globe, Menu, X } from 'lucide-react';
import { STAFF_DISPLAY_LIST } from '../i18n/translations.js';
import { useLanguage } from '../context/LanguageContext.jsx';
import { BohoSunMark } from './BohoAccents.jsx';

export function LanguageSwitcher({ compact = false, dark = false }) {
  const { lang, setLang } = useLanguage();

  return (
    <div
      className={`inline-flex items-center rounded-xl border p-0.5 text-xs font-medium transition-colors ${
        dark
          ? 'border-warm-terracotta/45 bg-white/10 text-warm-ivory'
          : 'border-warm-terracotta/60 bg-warm-sand/60 text-charcoal-green'
      }`}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`cursor-pointer rounded-lg transition-all duration-150 active:scale-[0.98] ${
          compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5'
        } ${
          lang === 'en'
            ? dark
              ? 'bg-warm-terracotta text-charcoal-green font-semibold shadow-xs'
              : 'bg-deep-sage text-warm-ivory shadow-xs'
            : dark
              ? 'text-warm-ivory/80 hover:bg-white/10 hover:text-white'
              : 'text-charcoal-green/75 hover:bg-white/60 hover:text-charcoal-green'
        }`}
      >
        {compact ? 'EN' : 'English'}
      </button>
      <button
        type="button"
        onClick={() => setLang('gu')}
        className={`cursor-pointer rounded-lg transition-all duration-150 active:scale-[0.98] ${
          compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5'
        } ${
          lang === 'gu'
            ? dark
              ? 'bg-warm-terracotta text-charcoal-green font-semibold shadow-xs'
              : 'bg-deep-sage text-warm-ivory shadow-xs'
            : dark
              ? 'text-warm-ivory/80 hover:bg-white/10 hover:text-white'
              : 'text-charcoal-green/75 hover:bg-white/60 hover:text-charcoal-green'
        }`}
      >
        {compact ? 'ગુજ' : 'ગુજરાતી'}
      </button>
    </div>
  );
}

export function AppHeader({ salonName = 'CELESTE', rightSlot = null, staffList = null }) {
  const { t, lang } = useLanguage();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const effectiveStaffList = Array.isArray(staffList) && staffList.length > 0 ? staffList : STAFF_DISPLAY_LIST;

  let savedTicketId = null;
  try {
    savedTicketId = window.localStorage.getItem('celeste_last_ticket_id');
  } catch {
    savedTicketId = null;
  }

  const navItems = [
    { to: '/', label: t('navHome'), end: true },
    { to: '/join', label: t('navJoin') },
    { to: '/appointments', label: t('navAppointments') },
    ...(savedTicketId ? [{ to: `/status/${savedTicketId}`, label: t('navStatus') }] : []),
    { to: '/reception', label: t('navReception') },
    { to: '/barber/aarav', label: t('navStaff'), matchPrefix: '/barber/' },
    { to: '/display', label: t('navDisplay') },
    { to: '/admin', label: t('navAdmin') },
  ];

  const isNavActive = (item) => {
    if (item.matchPrefix) {
      return location.pathname.startsWith(item.matchPrefix);
    }
    if (item.end) {
      return location.pathname === item.to;
    }
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-warm-terracotta/50 bg-[#FDFBF7]/95 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-2 px-3 py-3 sm:gap-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          onClick={() => setMobileMenuOpen(false)}
          className="group flex min-w-0 shrink-0 items-center gap-2 rounded-xl pr-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-celeste-sage sm:gap-3 sm:pr-2"
        >
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-warm-terracotta/85 bg-deep-sage font-serif text-lg font-semibold text-warm-ivory shadow-xs transition-transform duration-200 group-hover:scale-[1.03] sm:h-10 sm:w-10 sm:text-xl">
            <span>C</span>
            <BohoSunMark className="absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full bg-[#FDFBF7] p-0.5 text-warm-terracotta transition-transform duration-300 group-hover:rotate-12" />
          </div>
          <div className="min-w-0">
            <span className="block font-serif text-xl font-semibold leading-none tracking-[0.08em] text-charcoal-green sm:text-2xl sm:tracking-[0.09em]">
              {salonName}
            </span>
            <span className="mt-1 block truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-rose sm:text-[10px] sm:tracking-[0.22em]">
              {t('brandSubtitle')}
            </span>
          </div>
        </Link>

        {/* Desktop navigation */}
        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => {
            const active = isNavActive(item);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={() =>
                  `relative rounded-xl px-3.5 py-2 text-sm font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-celeste-sage ${
                    active
                      ? 'bg-soft-sage font-semibold text-deep-sage shadow-2xs ring-1 ring-celeste-sage/25'
                      : 'text-charcoal-green/75 hover:bg-warm-sand/65 hover:text-charcoal-green active:scale-[0.98]'
                  }`
                }
              >
                <span>{item.label}</span>
                {active && (
                  <span
                    aria-hidden="true"
                    className="mx-auto mt-0.5 flex items-center justify-center gap-1"
                  >
                    <span className="h-0.5 w-3 rounded-full bg-warm-terracotta" />
                    <span className="h-1 w-1 rounded-full bg-muted-rose/85" />
                    <span className="h-0.5 w-3 rounded-full bg-warm-terracotta" />
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          {rightSlot}
          <div className="hidden items-center gap-2 sm:flex">
            <Globe className="h-4 w-4 text-dusty-blue" aria-hidden="true" />
            <LanguageSwitcher />
          </div>
          <div className="sm:hidden">
            <LanguageSwitcher compact />
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-warm-terracotta/65 bg-warm-sand/55 p-2 text-charcoal-green transition hover:bg-soft-sage active:scale-[0.97] lg:hidden"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile / Tablet Navigation Drawer */}
      {mobileMenuOpen && (
        <nav
          aria-label="Mobile"
          className="celeste-animate-in border-t border-warm-terracotta/45 bg-[#FDFBF7] px-4 py-3.5 lg:hidden"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition active:scale-[0.98] ${
                  isNavActive(item)
                    ? 'border-celeste-sage/35 bg-soft-sage font-semibold text-deep-sage shadow-2xs'
                    : 'border-champagne/45 bg-warm-sand/35 text-charcoal-green/85 hover:bg-soft-sage/55'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {location.pathname.startsWith('/barber/') && (
            <div className="mt-3 border-t border-champagne/50 pt-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-rose">
                {lang === 'gu' ? 'સ્ટાઇલિસ્ટ પસંદ કરો' : 'Switch Stylist'}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {effectiveStaffList.map((member) => (
                  <Link
                    key={member.slug}
                    to={`/barber/${member.slug}`}
                    onClick={() => setMobileMenuOpen(false)}
                    className="rounded-lg border border-warm-terracotta/60 bg-warm-sand/45 px-2.5 py-1 text-xs font-medium text-charcoal-green transition hover:bg-soft-sage"
                  >
                    {lang === 'gu' ? member.name_gu : member.name_en}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>
      )}
    </header>
  );
}
