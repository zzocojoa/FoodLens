import { UserService } from '@/services/userService';
import { persistProfileImageIfNeeded } from '../utils/profileSheetStateUtils';

export const profileSheetService = {
  async loadProfile(userId: string) {
    return UserService.getUserProfile(userId);
  },

  async updateProfile(params: {
    userId: string;
    name: string;
    image: string;
    language?: string;
  }) {
    const profileImageToSave = await persistProfileImageIfNeeded(params.image);

    await UserService.CreateOrUpdateProfile(params.userId, 'user@example.com', {
      name: params.name,
      profileImage: profileImageToSave,
      settings: {
        targetLanguage: params.language,
        language: 'en',
        autoPlayAudio: false,
      },
    });
  },
};
