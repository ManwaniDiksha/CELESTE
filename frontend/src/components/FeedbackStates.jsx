import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext.jsx';
import { BohoBotanicalSprig, BohoSunburstDivider } from './BohoAccents.jsx';

export function PageLoading({ message }) {
  const { t } = useLanguage();
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-20 sm:px-6">
      <div className="celeste-card celeste-linen-surface celeste-animate-in flex flex-col items-center gap-3 rounded-3xl border border-warm-terracotta/55 px-10 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-warm-terracotta/60 bg-soft-sage/80">
          <Loader2 className="h-6 w-6 animate-spin text-deep-sage" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-charcoal-green/80">{message || t('loadingText')}</p>
        <BohoSunburstDivider align="center" className="mt-1 opacity-80" />
      </div>
    </main>
  );
}

export function PageError({ message, onRetry }) {
  const { t } = useLanguage();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-16 sm:px-6">
      <div className="celeste-card celeste-double-frame celeste-animate-in w-full rounded-3xl border border-muted-rose/45 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted-rose/15 text-rosewood">
          <AlertCircle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-4 font-serif text-2xl font-semibold text-charcoal-green">
          {message}
        </h2>
        <div className="mt-3 flex justify-center">
          <BohoBotanicalSprig className="h-5 w-5 text-muted-rose/65" />
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="celeste-btn-primary mt-5 inline-flex cursor-pointer items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            <span>{t('retryAction')}</span>
          </button>
        ) : (
          <Link
            to="/"
            className="celeste-btn-secondary mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>{t('navHome')}</span>
          </Link>
        )}
      </div>
    </main>
  );
}
