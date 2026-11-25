import { useLanguage } from '../context/LanguageContext.jsx';
import { getInitials } from '../utils/formatters.js';

const QUEUE_BADGE_STYLES = {
  Waiting: 'bg-soft-sage text-deep-sage border-celeste-sage/35',
  Called: 'bg-warm-terracotta/40 text-charcoal-green border-warm-terracotta',
  'In Chair': 'bg-deep-sage text-warm-ivory border-deep-sage',
  Done: 'bg-warm-sand text-charcoal-green border-champagne',
  Cancelled: 'bg-muted-rose/15 text-muted-rose border-muted-rose/40',
  'No-show': 'bg-dusty-blue/18 text-charcoal-green border-dusty-blue/40',
};

const AVAILABILITY_BADGE_STYLES = {
  Available: 'bg-soft-sage text-deep-sage border-celeste-sage/35',
  Busy: 'bg-deep-sage text-warm-ivory border-deep-sage',
  'On Break': 'bg-warm-sand text-charcoal-green border-warm-terracotta/85',
  'Off Duty': 'bg-charcoal-green/10 text-charcoal-green/75 border-charcoal-green/20',
};

const AVAILABILITY_DOT_STYLES = {
  Available: 'bg-celeste-sage',
  Busy: 'bg-warm-terracotta',
  'On Break': 'bg-muted-rose',
  'Off Duty': 'bg-charcoal-green/45',
};

export function QueueStatusBadge({ status, size = 'sm' }) {
  const { labelStatus } = useLanguage();
  const tone = QUEUE_BADGE_STYLES[status] || 'bg-soft-sage text-charcoal-green border-champagne/60';
  const sizing = size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide transition-colors duration-200 ${tone} ${sizing}`}
    >
      {labelStatus(status)}
    </span>
  );
}

export function StaffAvailabilityBadge({ availabilityStatus, isOnDuty = true, size = 'sm' }) {
  const { labelAvailability } = useLanguage();
  const effectiveKey = !isOnDuty ? 'Off Duty' : availabilityStatus;
  const tone = AVAILABILITY_BADGE_STYLES[effectiveKey] || AVAILABILITY_BADGE_STYLES['Off Duty'];
  const dot = AVAILABILITY_DOT_STYLES[effectiveKey] || 'bg-charcoal-green/40';
  const sizing = size === 'lg' ? 'px-3.5 py-1.5 text-sm' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold transition-colors duration-200 ${tone} ${sizing}`}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      <span>{labelAvailability(availabilityStatus, isOnDuty)}</span>
    </span>
  );
}

export function StaffAvatar({ staff, size = 'md' }) {
  const { pick } = useLanguage();
  const displayName = pick(staff, 'name') || staff?.name_en || 'Stylist';
  const initials = getInitials(staff?.name_en || displayName);

  const sizeClass =
    size === 'xl'
      ? 'h-16 w-16 text-2xl'
      : size === 'lg'
        ? 'h-12 w-12 text-lg'
        : size === 'sm'
          ? 'h-9 w-9 text-xs'
          : 'h-11 w-11 text-base';

  if (staff?.avatar_url) {
    return (
      <img
        src={staff.avatar_url}
        alt={displayName}
        className={`${sizeClass} shrink-0 rounded-full border-2 border-warm-terracotta/80 object-cover ring-2 ring-[#FDFBF7] shadow-2xs`}
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border-2 border-warm-terracotta/80 bg-warm-sand/85 font-serif font-semibold text-deep-sage ring-2 ring-[#FDFBF7] shadow-2xs`}
    >
      {initials}
    </div>
  );
}
