import { useSyncExternalStore } from 'react';
import { DEFAULT_LANGUAGE } from '../constants';
import { CanonicalLocale, I18nState, LanguageSettings } from '../types';
import type { UserProfile } from '@/models/User';
import { SafeStorage } from '@/services/storage_Logic';
import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser_Logic';
import { getUserStorageKey, USER_STORAGE_KEY } from '@/services/user/constants_Logic';
import {
  loadLanguageSettings,
  normalizeCanonicalLocale,
  normalizeLanguageSettings,
  resolveEffectiveLocale,
  saveLanguageSettings,
} from './languageService_Logic';

type Listener = () => void;

const INITIAL_SETTINGS: LanguageSettings = {
  language: DEFAULT_LANGUAGE,
  targetLanguage: null,
};

let state: I18nState = {
  settings: INITIAL_SETTINGS,
  locale: resolveEffectiveLocale(INITIAL_SETTINGS),
  ready: false,
};

let initialized = false;
let initializePromise: Promise<void> | null = null;
let profileSettingsSyncInFlight: Promise<void> | null = null;
const listeners = new Set<Listener>();
const UNAUTHENTICATED_USER_ID = 'auth-required';

const emit = () => {
  listeners.forEach((listener) => listener());
};

const setState = (next: I18nState) => {
  state = next;
  emit();
};

const readProfileLanguageSettingsSnapshot = (): Partial<LanguageSettings> | null => {
  const userId = getCurrentUserIdSnapshot();
  if (userId && userId !== 'auth-required') {
    const scoped = SafeStorage.getSync<UserProfile | null>(getUserStorageKey(userId), null);
    if (scoped?.settings) {
      const normalizedTarget = scoped.settings.targetLanguage
        ? normalizeCanonicalLocale(scoped.settings.targetLanguage)
        : null;
      return {
        language: normalizeCanonicalLocale(scoped.settings.language),
        targetLanguage: normalizedTarget === 'auto' ? null : normalizedTarget,
      };
    }
  }

  const legacy = SafeStorage.getSync<UserProfile | null>(USER_STORAGE_KEY, null);
  if (!legacy?.settings) return null;
  const normalizedLegacyTarget = legacy.settings.targetLanguage
    ? normalizeCanonicalLocale(legacy.settings.targetLanguage)
    : null;
  return {
    language: normalizeCanonicalLocale(legacy.settings.language),
    targetLanguage: normalizedLegacyTarget === 'auto' ? null : normalizedLegacyTarget,
  };
};

const areLanguageSettingsEqual = (left: LanguageSettings, right: LanguageSettings): boolean =>
  left.language === right.language && left.targetLanguage === right.targetLanguage;

const applyProfileLanguageSettingsSnapshot = async (): Promise<void> => {
  const profileSettings = readProfileLanguageSettingsSnapshot();
  if (!profileSettings) {
    return;
  }

  const normalizedSettings = normalizeLanguageSettings({
    language: profileSettings.language ?? state.settings.language,
    targetLanguage: profileSettings.targetLanguage ?? state.settings.targetLanguage,
  });

  if (areLanguageSettingsEqual(normalizedSettings, state.settings)) {
    if (!state.ready) {
      setState({
        settings: normalizedSettings,
        locale: resolveEffectiveLocale(normalizedSettings),
        ready: true,
      });
      initialized = true;
    } else if (normalizedSettings.language === 'auto') {
      refreshI18nLocaleFromDevice();
    }
    return;
  }

  await saveLanguageSettings(normalizedSettings);
  setState({
    settings: normalizedSettings,
    locale: resolveEffectiveLocale(normalizedSettings),
    ready: true,
  });
  initialized = true;
};

const normalizeRemoteLanguageSettings = (remote: {
  language?: string | null;
  target_language?: string | null;
}): LanguageSettings =>
  normalizeLanguageSettings({
    language: normalizeCanonicalLocale(remote.language),
    targetLanguage:
      remote.target_language === undefined
        ? state.settings.targetLanguage
        : (() => {
            const normalized = normalizeCanonicalLocale(remote.target_language);
            return normalized === 'auto' ? null : normalized;
          })(),
  });

const applyLanguageSettings = async (settings: LanguageSettings): Promise<void> => {
  if (areLanguageSettingsEqual(settings, state.settings)) {
    if (settings.language === 'auto') {
      refreshI18nLocaleFromDevice();
    }
    return;
  }

  await saveLanguageSettings(settings);
  setState({
    settings,
    locale: resolveEffectiveLocale(settings),
    ready: true,
  });
  initialized = true;
};

export const initializeI18nStore = async () => {
  if (initialized) return;
  if (initializePromise) return initializePromise;

  initializePromise = (async () => {
    const persistedSettings = await loadLanguageSettings();
    const profileSettings = readProfileLanguageSettingsSnapshot();
    const settings = normalizeLanguageSettings({
      language: profileSettings?.language ?? persistedSettings.language,
      targetLanguage: profileSettings?.targetLanguage ?? persistedSettings.targetLanguage,
    });
    if (
      settings.language !== persistedSettings.language ||
      settings.targetLanguage !== persistedSettings.targetLanguage
    ) {
      await saveLanguageSettings(settings);
    }
    if (state.ready) {
      initialized = true;
      return;
    }
    setState({
      settings,
      locale: resolveEffectiveLocale(settings),
      ready: true,
    });
    initialized = true;
  })();

  return initializePromise;
};

export const syncI18nSettingsFromProfile = async (
  options: { pullFromServer?: boolean } = {}
): Promise<void> => {
  if (profileSettingsSyncInFlight) {
    return profileSettingsSyncInFlight;
  }

  const pullFromServer = options.pullFromServer !== false;

  profileSettingsSyncInFlight = (async () => {
    const userId = getCurrentUserIdSnapshot();
    const hasAuthenticatedUser = userId !== UNAUTHENTICATED_USER_ID;

    if (pullFromServer && hasAuthenticatedUser) {
      try {
        const { Phase2Api } = await import('@/services/sync/phase2Api_Logic');
        const { settings } = await Phase2Api.getSettings();
        await applyLanguageSettings(normalizeRemoteLanguageSettings(settings));
        return;
      } catch {
        // Non-fatal. Fallback to local snapshot apply below.
      }
    }

    await applyProfileLanguageSettingsSnapshot();
  })().finally(() => {
    profileSettingsSyncInFlight = null;
  });

  return profileSettingsSyncInFlight;
};

export const getI18nSnapshot = (): I18nState => state;

export const subscribeI18n = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setI18nSettings = async (nextSettings: LanguageSettings) => {
  const normalizedSettings = normalizeLanguageSettings(nextSettings);
  await saveLanguageSettings(normalizedSettings);
  setState({
    settings: normalizedSettings,
    locale: resolveEffectiveLocale(normalizedSettings),
    ready: true,
  });
  initialized = true;
};

export const setUiLanguage = async (nextLanguage: CanonicalLocale) => {
  const nextSettings: LanguageSettings = {
    language: nextLanguage,
    targetLanguage: state.settings.targetLanguage,
  };

  await setI18nSettings(nextSettings);
};

export const refreshI18nLocaleFromDevice = () => {
  const nextLocale = resolveEffectiveLocale(state.settings);
  if (nextLocale === state.locale && state.ready) return;

  setState({
    settings: state.settings,
    locale: nextLocale,
    ready: true,
  });
};

export const useI18nSnapshot = () =>
  useSyncExternalStore(subscribeI18n, getI18nSnapshot, getI18nSnapshot);
