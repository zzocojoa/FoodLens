import { UserService } from '@/services/userService_Logic';
import { persistProfileImageIfNeeded } from '../utils/profileSheetStateUtils';
import { normalizeCanonicalLocale } from '@/features/i18n/services/languageService_Logic';
import {
  getI18nSnapshot,
  initializeI18nStore,
  setI18nSettings,
} from '@/features/i18n/services/i18nStore_Logic';
import type { CanonicalLocale } from '@/features/i18n/types';

const applyUiLanguageToI18nStore = async (language: CanonicalLocale): Promise<void> => {
  await initializeI18nStore();
  const i18nSettings = getI18nSnapshot().settings;
  await setI18nSettings({
    language,
    targetLanguage: i18nSettings.targetLanguage,
  });
};

export const profileSheetService = {
  async loadProfile(userId: string) {
    return UserService.getUserProfile(userId, {
      allowBackgroundRefresh: false,
      forceServerRefresh: true,
    });
  },

  async updateProfile(params: {
    userId: string;
    name: string;
    image?: string;
    travelerLanguage?: string;
    uiLanguage?: string;
  }) {
    const existing = await UserService.getUserProfile(params.userId, {
      allowBackgroundRefresh: false,
    });
    const imageInput = params.image?.trim() || '';
    const imageToPersist = imageInput || existing.profileImage || '';
    const profileImageToSave = imageToPersist
      ? await persistProfileImageIfNeeded(imageToPersist)
      : '';
    const normalizedUiLanguage = normalizeCanonicalLocale(
      params.uiLanguage || existing.settings?.language || 'auto'
    );

    try {
      await UserService.CreateOrUpdateProfile(params.userId, 'user@example.com', {
        name: params.name,
        profileImage: profileImageToSave,
        settings: {
          targetLanguage: params.travelerLanguage,
          language: normalizedUiLanguage,
          autoPlayAudio: false,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'PHASE2_SYNC_NOT_CONFIRMED') {
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
          targetLanguage: existing.settings?.targetLanguage,
          autoPlayAudio: existing.settings?.autoPlayAudio ?? false,
          selectedEmoji: existing.settings?.selectedEmoji,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'PHASE2_SYNC_NOT_CONFIRMED') {
        return;
      }
      throw error;
    }
  },
};
