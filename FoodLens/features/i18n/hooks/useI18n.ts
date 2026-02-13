import { useCallback, useEffect, useMemo } from 'react';
import { TRANSLATIONS } from '../constants';
import { CanonicalLocale } from '../types';
import {
  initializeI18nStore,
  setUiLanguage,
  useI18nSnapshot,
} from '../services/i18nStore';

export const useI18n = () => {
  const state = useI18nSnapshot();

  useEffect(() => {
    void initializeI18nStore();
  }, []);

  const setLocale = useCallback(async (nextLanguage: CanonicalLocale) => {
    await setUiLanguage(nextLanguage);
  }, []);

  const t = useCallback((key: string, fallback?: string) => {
    const dictionary = TRANSLATIONS[state.locale] || TRANSLATIONS['en-US'];
    return dictionary[key] ?? fallback ?? key;
  }, [state.locale]);

  const helpers = useMemo(() => {
    return {
      settings: state.settings,
      locale: state.locale,
      ready: state.ready,
      t,
      setLocale,
    };
  }, [setLocale, state.locale, state.ready, state.settings, t]);

  return helpers;
};
