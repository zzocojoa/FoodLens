import React from 'react';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import ProfileSheetView from './profileSheet/components/ProfileSheetView';
import { useProfileSheetController } from './profileSheet/hooks/useProfileSheetController';
import { ProfileSheetProps } from './profileSheet/types';
import { toLanguageLabel, toTargetLanguage } from './profileSheet/utils/profileSheetUtils';

export default function ProfileSheet({ isOpen, onClose, userId, onUpdate }: ProfileSheetProps) {
  const router = useRouter();
  const { theme: currentTheme, setTheme, colorScheme } = useTheme();
  const theme = Colors[colorScheme];

  const { state, profileSheet, languageSheet } = useProfileSheetController({
    isOpen,
    onClose,
    userId,
    onUpdate,
  });

  return (
    <ProfileSheetView
      isOpen={isOpen}
      closeProfile={profileSheet.closeSheet}
      onPressManageProfile={() => router.push('/profile')}
      onPressUpdate={() => void state.handleUpdate(onUpdate, onClose)}
      currentTheme={currentTheme}
      setTheme={setTheme}
      colorScheme={colorScheme}
      theme={theme}
      state={state}
      profilePanY={profileSheet.panY}
      profilePanHandlers={profileSheet.panResponder.panHandlers}
      languagePanY={languageSheet.panY}
      languagePanHandlers={languageSheet.panResponder.panHandlers}
      closeLanguageModal={languageSheet.closeSheet}
      languageLabel={toLanguageLabel(state.language)}
      toLanguageCode={toTargetLanguage}
    />
  );
}
