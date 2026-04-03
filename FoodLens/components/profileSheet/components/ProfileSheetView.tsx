import React from 'react';
import {
  ActivityIndicator,
  Animated as RNAnimated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Globe, LogOut, Shield, User } from 'lucide-react-native';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import AnimatedThemeToggle from './AnimatedThemeToggle';
import LanguageSelectorModal from './LanguageSelectorModal';
import ProfileIdentitySection from './ProfileIdentitySection';
import ProfileMenuItem from './ProfileMenuItem';
import { profileSheetStyles as styles } from '../styles';
import { LANGUAGE_OPTIONS, UI_LANGUAGE_OPTIONS } from '../constants';
import { normalizeTravelerTargetLanguage } from '@/services/travelerCardLanguage';
import { CanonicalLocale, useI18n } from '@/features/i18n';

type ProfileSheetViewProps = {
  isOpen: boolean;
  closeProfile: () => void;
  onPressManageProfile: () => void;
  onPressSupportHub: () => void;
  onPressUpdate: () => void;
  onPressLogout: () => void;
  logoutLoading: boolean;
  currentTheme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  colorScheme: string;
  theme: any;
  state: {
    name: string;
    image?: string;
    avatars: string[];
    travelerLanguage?: string;
    uiLanguage: CanonicalLocale;
    travelerLangModalVisible: boolean;
    uiLangModalVisible: boolean;
    loading: boolean;
    setName: (value: string) => void;
    setImage: (value: string) => void;
    setTravelerLanguage: (value: string | undefined) => void;
    setUiLanguage: (value: CanonicalLocale) => void;
    setTravelerLangModalVisible: (value: boolean) => void;
    setUiLangModalVisible: (value: boolean) => void;
    pickImage: (useCamera: boolean) => Promise<void>;
    handleUpdate: (onUpdate: () => void | Promise<void>, onClose: () => void) => Promise<void>;
  };
  profilePanY: RNAnimated.Value;
  profilePanHandlers: any;
  travelerLanguagePanY: RNAnimated.Value;
  travelerLanguagePanHandlers: any;
  closeTravelerLanguageModal: () => void;
  travelerLanguageLabel: string;
  uiLanguagePanY: RNAnimated.Value;
  uiLanguagePanHandlers: any;
  closeUiLanguageModal: () => void;
  uiLanguageLabel: string;
  toLanguageCode: (code: string) => string | undefined;
};

export default function ProfileSheetView({
  isOpen,
  closeProfile,
  onPressManageProfile,
  onPressSupportHub,
  onPressUpdate,
  onPressLogout,
  logoutLoading,
  currentTheme,
  setTheme,
  colorScheme,
  theme,
  state,
  profilePanY,
  profilePanHandlers,
  travelerLanguagePanY,
  travelerLanguagePanHandlers,
  closeTravelerLanguageModal,
  travelerLanguageLabel,
  uiLanguagePanY,
  uiLanguagePanHandlers,
  closeUiLanguageModal,
  uiLanguageLabel,
  toLanguageCode,
}: ProfileSheetViewProps) {
  const { t } = useI18n();
  const travelerOptions = React.useMemo(
    () =>
      LANGUAGE_OPTIONS.map((option) => ({
        ...option,
        label: t(`profileSheet.travelerLanguage.option.${option.code}`, option.label),
      })),
    [t]
  );
  const settingsLanguageOptions = React.useMemo(
    () =>
      UI_LANGUAGE_OPTIONS.map((option) => ({
        ...option,
        label: t(`profileSheet.settingsLanguage.option.${option.code}`, option.label),
      })),
    [t]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 999999 }]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop]} />
      <TouchableOpacity activeOpacity={1} style={styles.dismissArea} onPress={closeProfile} />

      <RNAnimated.View
        style={[
          styles.sheetContainer,
          { transform: [{ translateY: profilePanY }], backgroundColor: theme.background },
        ]}
      >
        <View {...profilePanHandlers} style={styles.swipeHandleWrapper}>
          <View style={styles.swipeHandle} />
        </View>

        <View {...profilePanHandlers} style={[styles.header, { justifyContent: 'center' }]}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {t('profileSheet.title', 'Profile')}
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          <ProfileIdentitySection
            theme={theme}
            colorScheme={colorScheme}
            name={state.name}
            image={state.image}
            avatars={state.avatars}
            onChangeName={state.setName}
            onClearName={() => state.setName('')}
            onPickCamera={() => void state.pickImage(true)}
            onPickLibrary={() => void state.pickImage(false)}
            onSelectPreset={state.setImage}
          />

          <View style={styles.section}>
            <AnimatedThemeToggle
              theme={theme}
              currentTheme={currentTheme}
              setTheme={setTheme}
              colorScheme={colorScheme}
            />

            <ProfileMenuItem
              icon={<User size={20} color="#2563EB" />}
              title={t('profileSheet.menu.manageProfile.title', 'Health Profile')}
              subtitle={t('profileSheet.menu.manageProfile.subtitle', 'Allergies, severity & dietary restrictions')}
              iconBgColor={colorScheme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF'}
              onPress={onPressManageProfile}
              theme={theme}
            />

            <ProfileMenuItem
              icon={<Shield size={20} color="#2563EB" />}
              title={t('profileSheet.menu.supportHub.title', 'Support & Policies')}
              subtitle={t('profileSheet.menu.supportHub.subtitle', 'Help, legal documents & account data')}
              iconBgColor={colorScheme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF'}
              onPress={onPressSupportHub}
              theme={theme}
            />

            <ProfileMenuItem
              icon={<Globe size={20} color="#059669" />}
              title={t('profileSheet.menu.travelerLanguage.title', 'Traveler Card Language')}
              subtitle={t('profileSheet.menu.travelerLanguage.subtitleTemplate', '{language} • Result card only').replace(
                '{language}',
                travelerLanguageLabel
              )}
              iconBgColor={colorScheme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5'}
              onPress={() => state.setTravelerLangModalVisible(true)}
              theme={theme}
            />

            <ProfileMenuItem
              icon={<Globe size={20} color="#2563EB" />}
              title={t('profileSheet.menu.settingsLanguage.title', 'Settings Language')}
              subtitle={uiLanguageLabel}
              iconBgColor={colorScheme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF'}
              onPress={() => state.setUiLangModalVisible(true)}
              theme={theme}
            />

            <ProfileMenuItem
              icon={<LogOut size={20} color="#DC2626" />}
              title={t('profileSheet.menu.logout.title', 'Log out')}
              subtitle={
                logoutLoading
                  ? t('profileSheet.menu.logout.loading', 'Signing out...')
                  : t('profileSheet.menu.logout.subtitle', 'End session on this device')
              }
              iconBgColor={colorScheme === 'dark' ? 'rgba(220, 38, 38, 0.2)' : '#FEF2F2'}
              onPress={onPressLogout}
              theme={theme}
            />
          </View>

          <LanguageSelectorModal
            visible={state.travelerLangModalVisible}
            title={t('profileSheet.travelerLanguage.modalTitle', 'Traveler Card Language')}
            options={travelerOptions}
            selectedCode={state.travelerLanguage}
            colorScheme={colorScheme}
            theme={theme}
            panY={travelerLanguagePanY}
            panHandlers={travelerLanguagePanHandlers}
            onClose={closeTravelerLanguageModal}
            onSelectLanguage={(code) => {
              state.setTravelerLanguage(toLanguageCode(code));
              closeTravelerLanguageModal();
            }}
            normalizeForSelection={normalizeTravelerTargetLanguage}
          />

          <LanguageSelectorModal
            visible={state.uiLangModalVisible}
            title={t('profileSheet.settingsLanguage.modalTitle', 'Settings Language')}
            options={settingsLanguageOptions}
            selectedCode={state.uiLanguage}
            colorScheme={colorScheme}
            theme={theme}
            panY={uiLanguagePanY}
            panHandlers={uiLanguagePanHandlers}
            onClose={closeUiLanguageModal}
            onSelectLanguage={(code) => {
              state.setUiLanguage(code as CanonicalLocale);
              closeUiLanguageModal();
            }}
          />

          <HapticTouchableOpacity
            onPress={onPressUpdate}
            disabled={state.loading}
            style={[styles.saveButton, { backgroundColor: theme.textPrimary, shadowColor: theme.shadow }]}
            hapticType="success"
          >
            {state.loading ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <Text style={[styles.saveText, { color: theme.background }]}>
                {t('profileSheet.action.updateProfile', 'UPDATE PROFILE')}
              </Text>
            )}
          </HapticTouchableOpacity>
        </ScrollView>
      </RNAnimated.View>
    </View>
  );
}
