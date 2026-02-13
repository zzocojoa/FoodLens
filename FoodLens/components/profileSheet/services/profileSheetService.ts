import { UserService } from '@/services/userService';
import { persistProfileImageIfNeeded } from '../utils/profileSheetStateUtils';
import { normalizeCanonicalLocale } from '@/features/i18n/services/languageService';
import {
  getI18nSnapshot,
  initializeI18nStore,
  setI18nSettings,
} from '@/features/i18n/services/i18nStore';

export const profileSheetService = {
  async loadProfile(userId: string) {
    return UserService.getUserProfile(userId);
  },

  async updateProfile(params: {
    userId: string;
    name: string;
    image: string;
    travelerLanguage?: string;
    uiLanguage?: string;
  }) {
    const profileImageToSave = await persistProfileImageIfNeeded(params.image);
    const existing = await UserService.getUserProfile(params.userId);
    const normalizedUiLanguage = normalizeCanonicalLocale(
      params.uiLanguage || existing.settings?.language || 'auto'
    );

    await UserService.CreateOrUpdateProfile(params.userId, 'user@example.com', {
      name: params.name,
      profileImage: profileImageToSave,
      settings: {
        targetLanguage: params.travelerLanguage,
        language: normalizedUiLanguage,
        autoPlayAudio: false,
      },
    });

    await initializeI18nStore();
    const i18nSettings = getI18nSnapshot().settings;
    await setI18nSettings({
      language: normalizedUiLanguage,
      targetLanguage: i18nSettings.targetLanguage,
    });
  },
};
