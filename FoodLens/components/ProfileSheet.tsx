import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/features/i18n';
import { AuthApi } from '@/services/auth/authApi';
import { AuthSecureSessionStore } from '@/services/auth/secureSessionStore';
import { clearSession } from '@/services/auth/sessionManager';
import { logoutFromOAuthProvider } from '@/services/auth/providerLogout';
import { dispatchPhase2SyncQueue } from '@/services/sync/phase2SyncQueue';
import ProfileSheetView from './profileSheet/components/ProfileSheetView';
import { LANGUAGE_OPTIONS, UI_LANGUAGE_OPTIONS } from './profileSheet/constants';
import { useProfileSheetController } from './profileSheet/hooks/useProfileSheetController';
import { ProfileSheetProps } from './profileSheet/types';
import {
  toLanguageLabel,
  toTargetLanguage,
  toUiLanguageLabel,
} from './profileSheet/utils/profileSheetUtils';

export default function ProfileSheet({ isOpen, onClose, userId, onUpdate }: ProfileSheetProps) {
  const router = useRouter();
  const { t } = useI18n();
  const { theme: currentTheme, setTheme, colorScheme } = useTheme();
  const theme = Colors[colorScheme];
  const [logoutLoading, setLogoutLoading] = useState(false);

  const { state, profileSheet, travelerLanguageSheet, uiLanguageSheet } = useProfileSheetController({
    isOpen,
    onClose,
    userId,
    onUpdate,
  });

  const travelerOptions = React.useMemo(
    () =>
      LANGUAGE_OPTIONS.map((option) => ({
        ...option,
        label: t(`profileSheet.travelerLanguage.option.${option.code}`),
      })),
    [t]
  );
  const settingsLanguageOptions = React.useMemo(
    () =>
      UI_LANGUAGE_OPTIONS.map((option) => ({
        ...option,
        label: t(`profileSheet.settingsLanguage.option.${option.code}`),
      })),
    [t]
  );
  const travelerAutoLabel = React.useMemo(
    () => {
      const autoOption = travelerOptions.find((option) => option.code === 'auto');
      if (!autoOption) {
        throw new Error('profileSheet traveler auto option is missing');
      }

      return autoOption.label;
    },
    [travelerOptions]
  );
  const settingsAutoLabel = React.useMemo(
    () => {
      const autoOption = settingsLanguageOptions.find((option) => option.code === 'auto');
      if (!autoOption) {
        throw new Error('profileSheet settings auto option is missing');
      }

      return autoOption.label;
    },
    [settingsLanguageOptions]
  );

  const confirmLogoutIntent = async (): Promise<boolean> =>
    new Promise((resolve) => {
      Alert.alert(
        t('profileSheet.logout.confirmTitle'),
        t('profileSheet.logout.confirmMessage'),
        [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('profileSheet.menu.logout.title'), style: 'destructive', onPress: () => resolve(true) },
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

      try {
        await dispatchPhase2SyncQueue();
      } catch (error) {
        console.warn('[Phase2Sync] Pre-logout queue flush failed', {
          request_id: requestId,
          user_id: currentUserId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        await AuthApi.logout({
          accessToken: storedSession?.accessToken,
          refreshToken: storedSession?.refreshToken,
        });
      } catch (error) {
        console.warn('[AuthSession] Backend logout failed', {
          request_id: requestId,
          user_id: currentUserId,
          provider: storedSession?.user?.provider ?? 'none',
          error: error instanceof Error ? error.message : String(error),
        });
      }

      const provider = storedSession?.user?.provider;
      await clearSession();
      router.replace('/login');
      void logoutFromOAuthProvider(provider).catch((error) => {
        console.warn('[AuthSession] Provider logout failed', {
          request_id: requestId,
          user_id: currentUserId,
          provider: provider ?? 'none',
          error: error instanceof Error ? error.message : String(error),
        });
      });
    } finally {
      setLogoutLoading(false);
    }
  };

  const handleManageProfile = React.useCallback(() => {
    onClose();
    requestAnimationFrame(() => {
      router.push({
        pathname: '/profile',
        params: { fromProfileSheet: '1' },
      });
    });
  }, [onClose, router]);

  const handleOpenSupportHub = React.useCallback(() => {
    onClose();
    requestAnimationFrame(() => {
      router.push({
        pathname: '/support-policies',
        params: { fromProfileSheet: '1' },
      });
    });
  }, [onClose, router]);

  return (
    <ProfileSheetView
      isOpen={isOpen}
      closeProfile={profileSheet.closeSheet}
      onPressManageProfile={handleManageProfile}
      onPressSupportHub={handleOpenSupportHub}
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
      travelerLanguageLabel={toLanguageLabel({
        language: state.travelerLanguage,
        fallbackLabel: travelerAutoLabel,
        options: travelerOptions,
      })}
      uiLanguagePanY={uiLanguageSheet.panY}
      uiLanguagePanHandlers={uiLanguageSheet.panResponder.panHandlers}
      closeUiLanguageModal={uiLanguageSheet.closeSheet}
      uiLanguageLabel={toUiLanguageLabel({
        language: state.uiLanguage,
        fallbackLabel: settingsAutoLabel,
        options: settingsLanguageOptions,
      })}
      toLanguageCode={toTargetLanguage}
    />
  );
}
