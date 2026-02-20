import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { AuthApi } from '@/services/auth/authApi';
import { AuthSecureSessionStore } from '@/services/auth/secureSessionStore';
import { clearSession } from '@/services/auth/sessionManager';
import ProfileSheetView from './profileSheet/components/ProfileSheetView';
import { useProfileSheetController } from './profileSheet/hooks/useProfileSheetController';
import { ProfileSheetProps } from './profileSheet/types';
import {
  toLanguageLabel,
  toTargetLanguage,
  toUiLanguageLabel,
} from './profileSheet/utils/profileSheetUtils';

export default function ProfileSheet({ isOpen, onClose, userId, onUpdate }: ProfileSheetProps) {
  const router = useRouter();
  const { theme: currentTheme, setTheme, colorScheme } = useTheme();
  const theme = Colors[colorScheme];
  const [logoutLoading, setLogoutLoading] = useState(false);

  const { state, profileSheet, travelerLanguageSheet, uiLanguageSheet } = useProfileSheetController({
    isOpen,
    onClose,
    userId,
    onUpdate,
  });

  const confirmLogoutIntent = async (): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(
        'Log out?',
        'You will be logged out and moved to the login screen.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Continue', style: 'destructive', onPress: () => resolve(true) },
        ]
      );
    });

  const handleLogout = async () => {
    if (logoutLoading) {
      return;
    }

    const confirmed = await confirmLogoutIntent();
    if (!confirmed) {
      return;
    }

    const requestId = `auth-logout-${Date.now().toString(36)}`;
    setLogoutLoading(true);

    let currentUserId = 'unknown';

    try {
      const storedSession = await AuthSecureSessionStore.read();
      currentUserId = storedSession?.user?.id ?? 'unknown';

      if (storedSession) {
        void AuthApi.logout({
          accessToken: storedSession.accessToken,
          refreshToken: storedSession.refreshToken,
        }).catch((error) => {
          console.warn('[AuthSession] Backend logout failed', {
            request_id: requestId,
            user_id: currentUserId,
            provider: storedSession.user?.provider ?? 'none',
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      await clearSession();
      router.replace('/login');
    } finally {
      setLogoutLoading(false);
    }
  };

  return (
    <ProfileSheetView
      isOpen={isOpen}
      closeProfile={profileSheet.closeSheet}
      onPressManageProfile={() => router.push('/profile')}
      onPressUpdate={() => void state.handleUpdate(onUpdate, onClose)}
      onPressLogout={() => void handleLogout()}
      logoutLoading={logoutLoading}
      currentTheme={currentTheme}
      setTheme={setTheme}
      colorScheme={colorScheme}
      theme={theme}
      state={state}
      profilePanY={profileSheet.panY}
      profilePanHandlers={profileSheet.panResponder.panHandlers}
      travelerLanguagePanY={travelerLanguageSheet.panY}
      travelerLanguagePanHandlers={travelerLanguageSheet.panResponder.panHandlers}
      closeTravelerLanguageModal={travelerLanguageSheet.closeSheet}
      travelerLanguageLabel={toLanguageLabel(state.travelerLanguage)}
      uiLanguagePanY={uiLanguageSheet.panY}
      uiLanguagePanHandlers={uiLanguageSheet.panResponder.panHandlers}
      closeUiLanguageModal={uiLanguageSheet.closeSheet}
      uiLanguageLabel={toUiLanguageLabel(state.uiLanguage)}
      toLanguageCode={toTargetLanguage}
    />
  );
}
