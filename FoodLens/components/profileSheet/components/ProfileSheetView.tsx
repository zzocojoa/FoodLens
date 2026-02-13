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
import { Globe, User, Zap } from 'lucide-react-native';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import AnimatedThemeToggle from './AnimatedThemeToggle';
import LanguageSelectorModal from './LanguageSelectorModal';
import ProfileIdentitySection from './ProfileIdentitySection';
import ProfileMenuItem from './ProfileMenuItem';
import { profileSheetStyles as styles } from '../styles';

type ProfileSheetViewProps = {
  isOpen: boolean;
  closeProfile: () => void;
  onPressManageProfile: () => void;
  onPressUpdate: () => void;
  currentTheme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  colorScheme: string;
  theme: any;
  state: {
    name: string;
    image: string;
    avatars: string[];
    language?: string;
    langModalVisible: boolean;
    loading: boolean;
    setName: (value: string) => void;
    setImage: (value: string) => void;
    setLanguage: (value: string | undefined) => void;
    setLangModalVisible: (value: boolean) => void;
    pickImage: (useCamera: boolean) => Promise<void>;
  };
  profilePanY: RNAnimated.Value;
  profilePanHandlers: any;
  languagePanY: RNAnimated.Value;
  languagePanHandlers: any;
  closeLanguageModal: () => void;
  languageLabel: string;
  toLanguageCode: (code: string) => string | undefined;
};

export default function ProfileSheetView({
  isOpen,
  closeProfile,
  onPressManageProfile,
  onPressUpdate,
  currentTheme,
  setTheme,
  colorScheme,
  theme,
  state,
  profilePanY,
  profilePanHandlers,
  languagePanY,
  languagePanHandlers,
  closeLanguageModal,
  languageLabel,
  toLanguageCode,
}: ProfileSheetViewProps) {
  return (
    <View
      style={[StyleSheet.absoluteFill, { zIndex: 999999, display: isOpen ? 'flex' : 'none' }]}
      pointerEvents={isOpen ? 'box-none' : 'none'}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={[styles.overlay, { opacity: isOpen ? 1 : 0 }, StyleSheet.absoluteFill]}
        onPress={closeProfile}
      />

      <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
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
            <Text style={[styles.title, { color: theme.textPrimary }]}>Profile</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            <ProfileIdentitySection
              theme={theme}
              colorScheme={colorScheme}
              name={state.name}
              image={state.image}
              avatars={state.avatars}
              onChangeName={state.setName}
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
                title="Manage Profile"
                subtitle="Account settings & details"
                iconBgColor={colorScheme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF'}
                onPress={onPressManageProfile}
                theme={theme}
              />

              <ProfileMenuItem
                icon={<Globe size={20} color="#059669" />}
                title="Translation Language"
                subtitle={languageLabel}
                iconBgColor={colorScheme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5'}
                onPress={() => state.setLangModalVisible(true)}
                theme={theme}
              />

              <ProfileMenuItem
                icon={<Zap size={20} color="#D97706" fill="#D97706" />}
                title="Remove Ads"
                subtitle="Premium benefits"
                iconBgColor={colorScheme === 'dark' ? 'rgba(217, 119, 6, 0.2)' : '#FFFBEB'}
                theme={theme}
              />
            </View>

            <LanguageSelectorModal
              visible={state.langModalVisible}
              language={state.language}
              colorScheme={colorScheme}
              theme={theme}
              panY={languagePanY}
              panHandlers={languagePanHandlers}
              onClose={closeLanguageModal}
              onSelectLanguage={(code) => {
                state.setLanguage(toLanguageCode(code));
                closeLanguageModal();
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
                <Text style={[styles.saveText, { color: theme.background }]}>UPDATE PROFILE</Text>
              )}
            </HapticTouchableOpacity>
          </ScrollView>
        </RNAnimated.View>
      </View>
    </View>
  );
}
