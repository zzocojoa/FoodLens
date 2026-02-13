import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LANGUAGE, TRANSLATIONS } from '../constants';
import { loadLanguageSettings, resolveEffectiveLocale, saveLanguageSettings } from '../services/languageService';
import { CanonicalLocale, I18nState, LanguageSettings } from '../types';

export const useI18n = () => {
  const [state, setState] = useState<I18nState>({
    settings: {
      language: DEFAULT_LANGUAGE,
      targetLanguage: null,
    },
    locale: 'en-US',
    ready: false,
  });

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      const settings = await loadLanguageSettings();
      if (!mounted) return;
      setState({
        settings,
        locale: resolveEffectiveLocale(settings),
        ready: true,
      });
    };

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  const setLocale = useCallback(async (nextLanguage: CanonicalLocale) => {
    const nextSettings: LanguageSettings =
      nextLanguage === 'auto'
        ? { language: 'auto', targetLanguage: null }
        : { language: nextLanguage, targetLanguage: nextLanguage };

    await saveLanguageSettings(nextSettings);
    setState({
      settings: nextSettings,
      locale: resolveEffectiveLocale(nextSettings),
      ready: true,
    });
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
