import { useSyncExternalStore } from 'react';
import { DEFAULT_LANGUAGE } from '../constants';
import { CanonicalLocale, I18nState, LanguageSettings } from '../types';
import { loadLanguageSettings, resolveEffectiveLocale, saveLanguageSettings } from './languageService';

type Listener = () => void;

let state: I18nState = {
  settings: {
    language: DEFAULT_LANGUAGE,
    targetLanguage: null,
  },
  locale: 'en-US',
  ready: false,
};

let initialized = false;
let initializePromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

const emit = () => {
  listeners.forEach((listener) => listener());
};

const setState = (next: I18nState) => {
  state = next;
  emit();
};

export const initializeI18nStore = async () => {
  if (initialized) return;
  if (initializePromise) return initializePromise;

  initializePromise = (async () => {
    const settings = await loadLanguageSettings();
    setState({
      settings,
      locale: resolveEffectiveLocale(settings),
      ready: true,
    });
    initialized = true;
  })();

  return initializePromise;
};

export const getI18nSnapshot = (): I18nState => state;

export const subscribeI18n = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setI18nSettings = async (nextSettings: LanguageSettings) => {
  await saveLanguageSettings(nextSettings);
  setState({
    settings: nextSettings,
    locale: resolveEffectiveLocale(nextSettings),
    ready: true,
  });
};

export const setUiLanguage = async (nextLanguage: CanonicalLocale) => {
  const nextSettings: LanguageSettings = {
    language: nextLanguage,
    targetLanguage: state.settings.targetLanguage,
  };

  await setI18nSettings(nextSettings);
};

export const useI18nSnapshot = () =>
  useSyncExternalStore(subscribeI18n, getI18nSnapshot, getI18nSnapshot);
