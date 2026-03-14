import { useSyncExternalStore } from 'react';
import { DEFAULT_LANGUAGE } from '../constants';
import { CanonicalLocale, I18nState, LanguageSettings } from '../types';
import type { UserProfile } from '@/models/User';
import { SafeStorage } from '@/services/storage';
import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser';
import { getUserStorageKey, USER_STORAGE_KEY } from '@/services/user/constants';
import { publishUserProfileUpdated } from '@/services/user/userProfileStore';
import { logger } from '@/services/logger';
import { getQueuedPhase2EntityPayload } from '@/services/sync/phase2SyncQueue';
import { isRemoteSettingsSnapshotStale } from '@/services/sync/settingsFreshness';
import {
  loadLanguageSettings,
  normalizeLanguageSettings,
  resolveEffectiveLocale,
  saveLanguageSettings,
} from './languageService';

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

const normalizeProfileLanguageSettings = (
  profile: UserProfile | null | undefined
): LanguageSettings | null => {
  if (!profile?.settings) {
    return null;
  }

  return normalizeLanguageSettings(profile.settings);
};

const readProfileSnapshot = (): UserProfile | null => {
  const userId = getCurrentUserIdSnapshot();
  if (userId && userId !== 'auth-required') {
    const scoped = SafeStorage.getSync<UserProfile | null>(getUserStorageKey(userId), null);
    if (scoped) {
      return scoped;
    }
  }

  return SafeStorage.getSync<UserProfile | null>(USER_STORAGE_KEY, null);
};

const readProfileLanguageSettingsSnapshot = (): LanguageSettings | null => {
  return normalizeProfileLanguageSettings(readProfileSnapshot());
};

const areLanguageSettingsEqual = (left: LanguageSettings, right: LanguageSettings): boolean =>
  left.language === right.language && left.targetLanguage === right.targetLanguage;

const hasRemoteTravelerTargetLanguage = (remote: {
  target_language?: string | null;
}): boolean => Object.prototype.hasOwnProperty.call(remote, 'target_language');

const applyQueuedSettingsPayload = (
  baseSettings: LanguageSettings,
  payload: Record<string, unknown> | null
): LanguageSettings => {
  if (!payload) {
    return baseSettings;
  }

  return normalizeLanguageSettings({
    language:
      typeof payload['language'] === 'string' || payload['language'] === null
        ? (payload['language'] as string | null)
        : baseSettings.language,
    targetLanguage: Object.prototype.hasOwnProperty.call(payload, 'target_language')
      ? ((payload['target_language'] as string | null | undefined) ?? null)
      : baseSettings.targetLanguage,
  });
};

const persistLanguageSettingsToProfileSnapshot = async (nextSettings: LanguageSettings): Promise<void> => {
  const userId = getCurrentUserIdSnapshot();
  if (!userId || userId === UNAUTHENTICATED_USER_ID) {
    return;
  }

  const scopedKey = getUserStorageKey(userId);
  const scoped = SafeStorage.getSync<UserProfile | null>(scopedKey, null);
  const legacy = SafeStorage.getSync<UserProfile | null>(USER_STORAGE_KEY, null);
  const baseProfile = scoped || legacy;
  const currentSettings = normalizeProfileLanguageSettings(baseProfile);
  if (!baseProfile?.settings || !currentSettings) {
    return;
  }

  if (areLanguageSettingsEqual(currentSettings, nextSettings)) {
    return;
  }

  const nextProfile: UserProfile = {
    ...baseProfile,
    settings: {
      ...baseProfile.settings,
      language: nextSettings.language,
      targetLanguage: nextSettings.targetLanguage ?? undefined,
    },
  };

  await Promise.all([
    SafeStorage.set(scopedKey, nextProfile),
    SafeStorage.set(USER_STORAGE_KEY, nextProfile),
  ]);
  publishUserProfileUpdated(userId, 'server_pull');
};

const applyProfileLanguageSettingsSnapshot = async (): Promise<void> => {
  const profileSettings = readProfileLanguageSettingsSnapshot();
  if (!profileSettings) {
    return;
  }

  const userId = getCurrentUserIdSnapshot();
  const queuedSettingsPayload =
    userId && userId !== UNAUTHENTICATED_USER_ID
      ? await getQueuedPhase2EntityPayload(userId, 'settings')
      : null;
  const normalizedSettings = applyQueuedSettingsPayload(profileSettings, queuedSettingsPayload);

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

export const normalizeRemoteLanguageSettings = (remote: {
  language?: string | null;
  target_language?: string | null;
}): LanguageSettings =>
  normalizeLanguageSettings({
    language: remote.language,
    targetLanguage: hasRemoteTravelerTargetLanguage(remote) ? remote.target_language : null,
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
    const userId = getCurrentUserIdSnapshot();
    const queuedSettingsPayload =
      userId && userId !== UNAUTHENTICATED_USER_ID
        ? await getQueuedPhase2EntityPayload(userId, 'settings')
        : null;
    const settings = applyQueuedSettingsPayload(profileSettings ?? persistedSettings, queuedSettingsPayload);
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
        const { Phase2Api } = await import('@/services/sync/phase2Api');
        const { settings } = await Phase2Api.getSettings();
        const profileSnapshot = readProfileSnapshot();
        if (isRemoteSettingsSnapshotStale({ localProfile: profileSnapshot, remoteSettings: settings })) {
          logger.warn('[Phase2Sync] ignoring stale remote settings snapshot', {
            user_id: userId,
            local_updated_at: profileSnapshot?.syncVersions?.settingsUpdatedAt || null,
            remote_updated_at: settings.updated_at || null,
          });
          await applyProfileLanguageSettingsSnapshot();
          return;
        }
        const queuedSettingsPayload = await getQueuedPhase2EntityPayload(userId, 'settings');
        const normalized = applyQueuedSettingsPayload(
          normalizeRemoteLanguageSettings(settings),
          queuedSettingsPayload
        );
        await applyLanguageSettings(normalized);
        await persistLanguageSettingsToProfileSnapshot(normalized);
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
