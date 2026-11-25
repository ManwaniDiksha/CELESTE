import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  AVAILABILITY_LABELS,
  CATEGORY_LABELS,
  DAYS_OF_WEEK,
  QUEUE_STATUS_LABELS,
  TRANSLATIONS,
} from '../i18n/translations.js';

const STORAGE_KEY = 'celeste_lang';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      return saved === 'gu' ? 'gu' : 'en';
    } catch {
      return 'en';
    }
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore storage failures in restricted browsing modes.
    }
  }, [lang]);

  const setLang = useCallback((nextLang) => {
    setLangState(nextLang === 'gu' ? 'gu' : 'en');
  }, []);

  const toggleLang = useCallback(() => {
    setLangState((prev) => (prev === 'en' ? 'gu' : 'en'));
  }, []);

  const t = useCallback(
    (key, params = {}) => {
      const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
      let text = dict[key] ?? TRANSLATIONS.en[key] ?? key;
      for (const [paramKey, paramValue] of Object.entries(params)) {
        text = text.replaceAll(`{${paramKey}}`, String(paramValue ?? ''));
      }
      return text;
    },
    [lang]
  );

  const pick = useCallback(
    (item, prefix = 'name') => {
      if (!item) return '';
      const localized = item[`${prefix}_${lang}`];
      if (localized) return localized;
      return item[`${prefix}_en`] ?? item[`${prefix}_gu`] ?? item[prefix] ?? '';
    },
    [lang]
  );

  const pickSnapshotName = useCallback(
    (serviceRow) => {
      if (!serviceRow) return '';
      if (lang === 'gu') {
        return serviceRow.service_name_gu_snapshot || serviceRow.service_name_en_snapshot || serviceRow.name_gu || serviceRow.name_en || '';
      }
      return serviceRow.service_name_en_snapshot || serviceRow.service_name_gu_snapshot || serviceRow.name_en || serviceRow.name_gu || '';
    },
    [lang]
  );

  const labelStatus = useCallback(
    (status) => {
      const map = QUEUE_STATUS_LABELS[lang] || QUEUE_STATUS_LABELS.en;
      return map[status] || status || '—';
    },
    [lang]
  );

  const labelAvailability = useCallback(
    (availabilityStatus, isOnDuty = true) => {
      const map = AVAILABILITY_LABELS[lang] || AVAILABILITY_LABELS.en;
      if (!isOnDuty) return map['Off Duty'];
      return map[availabilityStatus] || availabilityStatus || '—';
    },
    [lang]
  );

  const labelCategory = useCallback(
    (category) => {
      const map = CATEGORY_LABELS[lang] || CATEGORY_LABELS.en;
      return map[category] || category || '';
    },
    [lang]
  );

  const labelDay = useCallback(
    (dayKey) => {
      const map = DAYS_OF_WEEK[lang] || DAYS_OF_WEEK.en;
      return map[dayKey] || dayKey || '';
    },
    [lang]
  );

  const value = useMemo(
    () => ({
      lang,
      setLang,
      toggleLang,
      t,
      pick,
      pickSnapshotName,
      labelStatus,
      labelAvailability,
      labelCategory,
      labelDay,
    }),
    [lang, setLang, toggleLang, t, pick, pickSnapshotName, labelStatus, labelAvailability, labelCategory, labelDay]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a LanguageProvider.');
  }
  return ctx;
}
