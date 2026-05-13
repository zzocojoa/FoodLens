import { UserService } from '@/services/userService';
import { persistProfileImageIfNeeded } from '../utils/profileSheetStateUtils';
import { normalizeCanonicalLocale } from '@/features/i18n/services/languageService';
import {
  getI18nSnapshot,
  initializeI18nStore,
  setI18nSettings,
} from '@/features/i18n/services/i18nStore';
import type { CanonicalLocale, LanguageSettings } from '@/features/i18n/types';

const resolveTravelerTargetLanguage = (
  travelerLanguage?: string
): LanguageSettings['targetLanguage'] => {
  const normalizedTargetLanguage = normalizeCanonicalLocale(travelerLanguage || 'auto');
  return normalizedTargetLanguage === 'auto' ? null : normalizedTargetLanguage;
};

const isDeferredPhase2SyncError = (error: unknown): boolean =>
  error instanceof Error && error.message === 'PHASE2_SYNC_NOT_CONFIRMED';

const applyI18nSettingsToStore = async (
  resolveNextSettings: (currentSettings: LanguageSettings) => LanguageSettings
): Promise<void> => {
  await initializeI18nStore();
  await setI18nSettings(resolveNextSettings(getI18nSnapshot().settings));
};

const applyUiLanguageToI18nStore = async (language: CanonicalLocale): Promise<void> => {
  await applyI18nSettingsToStore((currentSettings) => ({
    ...currentSettings,
    language,
  }));
};

const applyTravelerLanguageToI18nStore = async (travelerLanguage?: string): Promise<void> => {
  await applyI18nSettingsToStore((currentSettings) => ({
    ...currentSettings,
    targetLanguage: resolveTravelerTargetLanguage(travelerLanguage),
  }));
};

export const profileSheetService = {
  async loadProfile(userId: string) {
    return UserService.getUserProfile(userId, {
      allowBackgroundRefresh: false,
      forceServerRefresh: false,
    });
  },

  async updateProfile(params: {
    userId: string;
    name: string;
    image?: string;
    imageChanged?: boolean;
    travelerLanguage?: string;
    uiLanguage?: string;
  }) {
    const shouldPersistImage = params.imageChanged !== false;
    const imageInput = params.image?.trim() || '';
    const shouldLoadExistingProfile = (shouldPersistImage && !imageInput) || !params.uiLanguage;
    const existing = shouldLoadExistingProfile
      ? await UserService.getUserProfile(params.userId, {
          allowBackgroundRefresh: false,
        })
      : null;
    const imageToPersist = shouldPersistImage ? imageInput || existing?.profileImage || '' : '';
    const profileImageToSave = shouldPersistImage && imageToPersist
      ? await persistProfileImageIfNeeded(imageToPersist)
      : undefined;
    const normalizedUiLanguage = normalizeCanonicalLocale(
      params.uiLanguage || existing?.settings?.language || 'auto'
    );

    try {
      // Settings are auto-saved by dedicated handlers (ui/traveler language).
      // Avoid resending potentially stale settings payload from profile update path.
      await UserService.CreateOrUpdateProfile(params.userId, 'user@example.com', {
        name: params.name,
        ...(profileImageToSave !== undefined ? { profileImage: profileImageToSave } : {}),
      });
    } catch (error) {
      if (isDeferredPhase2SyncError(error)) {
        await applyUiLanguageToI18nStore(normalizedUiLanguage);
      }
      throw error;
    }

    await applyUiLanguageToI18nStore(normalizedUiLanguage);
  },

  async updateSettingsLanguage(params: {
    userId: string;
    uiLanguage: string;
  }) {
    const normalizedUiLanguage = normalizeCanonicalLocale(params.uiLanguage || 'auto');
    await applyUiLanguageToI18nStore(normalizedUiLanguage);

    const existing = await UserService.getUserProfile(params.userId, {
      allowBackgroundRefresh: false,
    });
    const existingLanguage = normalizeCanonicalLocale(existing.settings?.language || 'auto');
    if (existingLanguage === normalizedUiLanguage) {
      return;
    }

    try {
      await UserService.CreateOrUpdateProfile(params.userId, existing.email || 'user@example.com', {
        settings: {
          language: normalizedUiLanguage,
        },
      });
    } catch (error) {
      if (isDeferredPhase2SyncError(error)) {
        return;
      }
      throw error;
    }
  },

  async updateTravelerLanguage(params: {
    userId: string;
    travelerLanguage?: string;
    shouldAbort?: () => boolean;
  }) {
    if (params.shouldAbort?.()) {
      return;
    }

    const normalizedTargetLanguage = resolveTravelerTargetLanguage(params.travelerLanguage) ?? undefined;
    await applyTravelerLanguageToI18nStore(params.travelerLanguage);
    if (params.shouldAbort?.()) {
      return;
    }

    const existing = await UserService.getUserProfile(params.userId, {
      allowBackgroundRefresh: false,
      forceServerRefresh: true,
    });
    if (params.shouldAbort?.()) {
      return;
    }
    const existingTargetLanguage = normalizeCanonicalLocale(existing.settings?.targetLanguage || 'auto');
    if (existingTargetLanguage === (normalizedTargetLanguage || 'auto')) {
      return;
    }

    try {
      if (params.shouldAbort?.()) {
        return;
      }
      await UserService.CreateOrUpdateProfile(params.userId, existing.email || 'user@example.com', {
        settings: {
          targetLanguage: normalizedTargetLanguage,
        },
      });
    } catch (error) {
      if (isDeferredPhase2SyncError(error)) {
        return;
      }
      throw error;
    }
  },
};
