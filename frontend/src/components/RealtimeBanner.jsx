import { RefreshCw, WifiOff } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';

export function RealtimeBanner({ status, onReconnect, className = '' }) {
  const { t } = useLanguage();

  if (status !== 'disconnected' && status !== 'reconnecting' && status !== 'unconfigured') {
    return null;
  }

  return (
    <div
      role="status"
      className={`border-b border-champagne bg-champagne/30 text-charcoal-green ${className}`}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <WifiOff className="h-4 w-4 shrink-0 text-rosewood" aria-hidden="true" />
          <span className="font-medium">
            {status === 'reconnecting' ? t('realtimeReconnecting') : t('realtimeDisconnected')}
          </span>
        </div>
        <button
          type="button"
          onClick={onReconnect}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-charcoal-green/20 bg-white px-3 py-1 text-xs font-semibold text-charcoal-green transition hover:bg-soft-sage"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t('refreshAction')}</span>
        </button>
      </div>
    </div>
  );
}
