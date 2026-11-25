/**
 * Lightweight, reusable inline-SVG bohemian & botanical line-art accents.
 * Strictly decorative (aria-hidden, pointer-events-none) so interactions and
 * screen-reader clarity are never affected.
 */

export function BohoBotanicalSprig({ className = 'h-5 w-5 text-celeste-sage' }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={`pointer-events-none shrink-0 ${className}`}
    >
      <path
        d="M5.5 22.5C11 17.5 16.5 12 22.5 5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M11 17C8 16.5 6.5 14.3 7.2 11.5C10.1 11.1 12.1 13.2 11 17Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M15.4 12.2C18.4 12.8 19.8 15 18.9 17.6C16.2 17.8 14.4 15.6 15.4 12.2Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 11.1C14.1 10.5 13 8.5 13.8 6C16.2 5.9 17.7 8 16.5 11.1Z"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <circle cx="23.2" cy="4.3" r="1.1" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

export function BohoSunMark({ className = 'h-4 w-4 text-warm-terracotta' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={`pointer-events-none shrink-0 ${className}`}
    >
      <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="1.35" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" opacity="0.75" />
      <path
        d="M12 2.2V5.1M12 18.9V21.8M2.2 12H5.1M18.9 12H21.8M5.1 5.1L7.1 7.1M16.9 16.9L18.9 18.9M18.9 5.1L16.9 7.1M7.1 16.9L5.1 18.9"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BohoSunburstDivider({ className = '', align = 'left' }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none flex items-center gap-2.5 ${
        align === 'center' ? 'justify-center' : ''
      } ${className}`}
    >
      {align === 'center' && <span className="h-px w-12 bg-warm-terracotta/85" />}
      <span className="h-1.5 w-1.5 rounded-full bg-muted-rose/75" />
      <BohoSunMark className="h-4 w-4 text-warm-terracotta" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-rose/75" />
      <span className="h-px w-16 bg-warm-terracotta/85" />
      <span className="h-1 w-1 rounded-full bg-warm-terracotta/80" />
    </div>
  );
}

export function BohoBranchRule({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none flex items-center gap-3 ${className}`}
    >
      <span className="h-px flex-1 bg-warm-terracotta/45" />
      <span className="h-1 w-1 rounded-full bg-muted-rose/65" />
      <BohoBotanicalSprig className="h-4 w-4 text-celeste-sage/85" />
      <span className="h-1 w-1 rounded-full bg-muted-rose/65" />
      <span className="h-px flex-1 bg-warm-terracotta/45" />
    </div>
  );
}

export function BohoCornerLeaf({ className = 'h-24 w-24 text-warm-terracotta/55' }) {
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      aria-hidden="true"
      className={`pointer-events-none select-none ${className}`}
    >
      <path
        d="M84 12C64 20 44 40 30 78"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        d="M66 26C56 22 48 26 46 35C54 38 62 34 66 26Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M52 43C42 40 35 45 33 54C42 56 49 51 52 43Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M62 33C68 41 67 50 58 54C52 47 54 38 62 33Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M45 55C51 62 50 71 42 75C36 68 38 60 45 55Z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M36 66C28 64 22 68 21 75C28 77 34 73 36 66Z"
        stroke="currentColor"
        strokeWidth="1.15"
      />
      <circle cx="74" cy="20" r="1.8" fill="currentColor" />
      <circle cx="24" cy="83" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function BohoCornerFlourish({ className = 'h-8 w-8 text-warm-terracotta/70' }) {
  const hasExplicitSize = /\b(?:h-|w-|size-)/.test(className);
  const sizeFallback = hasExplicitSize ? '' : 'h-7 w-7';

  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
      className={`pointer-events-none shrink-0 select-none ${sizeFallback} ${className}`}
    >
      <path
        d="M6 28C6 16 16 6 28 6"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M11 28C11 19 19 11 28 11"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle cx="28" cy="6" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function BohoEyebrow({ children, className = '' }) {
  return (
    <div
      className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-rose ${className}`}
    >
      <BohoBotanicalSprig className="h-4 w-4 text-celeste-sage" />
      <span>{children}</span>
      <span aria-hidden="true" className="h-1 w-1 rounded-full bg-warm-terracotta" />
    </div>
  );
}
