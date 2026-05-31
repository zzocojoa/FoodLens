import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/features/i18n';
import LogoutConfirmationDialog from '@/features/profile/components/LogoutConfirmationDialog';
import {
  runFoodLensLogoutFlow,
  startProviderLogoutAfterFoodLensLogout,
} from '@/services/auth/logoutFlow';
import type { FoodLensLogoutFailure } from '@/services/auth/logoutFlow';
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
  const [logoutDialogVisible, setLogoutDialogVisible] = useState(false);

  const { state, profileSheet, travelerLanguageSheet, uiLanguageSheet } = useProfileSheetController({
    isOpen,
    onClose,
    userId,
    onUpdate,
  });

  React.useEffect((): void => {
    if (isOpen) {
      return;
    }

    setLogoutDialogVisible(false);
  }, [isOpen]);

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

  const handleOpenLogoutDialog = React.useCallback((): void => {
    if (logoutLoading) {
      return;
    }

    setLogoutDialogVisible(true);
  }, [logoutLoading]);

  const handleCancelLogoutDialog = React.useCallback((): void => {
    setLogoutDialogVisible(false);
  }, []);

  const showLogoutFailure = React.useCallback((failure: FoodLensLogoutFailure): void => {
    if (failure.reason === 'server_logout_failed') {
      Alert.alert(
        t('profileSheet.logout.serverLogoutFailed.title', 'Logout failed'),
        t(
          'profileSheet.logout.serverLogoutFailed.message',
          'FoodLens could not revoke your session. You are still signed in. Check your connection and try again.',
        ),
      );
      return;
    }

    Alert.alert(
      t('profileSheet.logout.localClearFailed.title', 'Logout incomplete'),
      t(
        'profileSheet.logout.localClearFailed.message',
        'This device could not be cleared. Please try logging out again before handing over the device.',
      ),
    );
  }, [t]);

  const handleLogout = React.useCallback(async (): Promise<void> => {
    if (logoutLoading) {
      return;
    }

    setLogoutLoading(true);

    try {
      const result = await runFoodLensLogoutFlow();
      if (result.status === 'failure') {
        showLogoutFailure(result);
        return;
      }

      router.replace('/login');
      startProviderLogoutAfterFoodLensLogout(result);
    } finally {
      setLogoutLoading(false);
    }
  }, [logoutLoading, router, showLogoutFailure]);

  const handleConfirmLogoutDialog = React.useCallback((): void => {
    setLogoutDialogVisible(false);
    void handleLogout();
  }, [handleLogout]);

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
    <>
    <ProfileSheetView
      isOpen={isOpen}
      closeProfile={profileSheet.closeSheet}
      onPressManageProfile={handleManageProfile}
      onPressSupportHub={handleOpenSupportHub}
      onPressUpdate={() => void state.handleUpdate(onUpdate, onClose)}
      onPressLogout={handleOpenLogoutDialog}
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
    <LogoutConfirmationDialog
      cancelAccessibilityHint={t('profileSheet.logout.cancelAccessibilityHint')}
      cancelAccessibilityLabel={t('profileSheet.logout.cancelAccessibilityLabel')}
      cancelLabel={t('common.cancel')}
      colorScheme={colorScheme}
      confirmAccessibilityHint={t('profileSheet.logout.confirmAccessibilityHint')}
      confirmAccessibilityLabel={t('profileSheet.logout.confirmAccessibilityLabel')}
      confirmLabel={t('profileSheet.menu.logout.title')}
      dialogAccessibilityLabel={t('profileSheet.logout.dialogAccessibilityLabel')}
      message={t('profileSheet.logout.confirmMessage')}
      onCancel={handleCancelLogoutDialog}
      onConfirm={handleConfirmLogoutDialog}
      title={t('profileSheet.logout.confirmTitle')}
      visible={isOpen && logoutDialogVisible}
    />
    </>
  );
}
