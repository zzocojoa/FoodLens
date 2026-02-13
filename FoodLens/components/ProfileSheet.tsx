import React from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Animated as RNAnimated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Globe, User, Zap } from 'lucide-react-native';
import { HapticTouchableOpacity } from './HapticFeedback';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import AnimatedThemeToggle from './profileSheet/components/AnimatedThemeToggle';
import LanguageSelectorModal from './profileSheet/components/LanguageSelectorModal';
import ProfileIdentitySection from './profileSheet/components/ProfileIdentitySection';
import ProfileMenuItem from './profileSheet/components/ProfileMenuItem';
import { useProfileSheetState } from './profileSheet/hooks/useProfileSheetState';
import { useProfileSheetEffects } from './profileSheet/hooks/useProfileSheetEffects';
import { useSheetGesture } from './profileSheet/hooks/useSheetGesture';
import { profileSheetStyles as styles } from './profileSheet/styles';
import { ProfileSheetProps } from './profileSheet/types';
import { toLanguageLabel, toTargetLanguage } from './profileSheet/utils/profileSheetUtils';

export default function ProfileSheet({ isOpen, onClose, userId, onUpdate }: ProfileSheetProps) {
    const router = useRouter();
    const { theme: currentTheme, setTheme, colorScheme } = useTheme();
    const theme = Colors[colorScheme];

    const state = useProfileSheetState(userId);

    const {
        panY: panYProfile,
        panResponder: panResponderProfile,
        openSheet: openProfile,
        closeSheet: closeProfile,
    } = useSheetGesture(onClose);

    const {
        panY,
        panResponder,
        openSheet: openLangModal,
        closeSheet: closeLangModal,
    } = useSheetGesture(() => state.setLangModalVisible(false));

    useProfileSheetEffects({
        isOpen,
        userId,
        isLanguageModalVisible: state.langModalVisible,
        openProfile,
        openLanguageModal: openLangModal,
        loadProfile: state.loadProfile,
    });

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
                        { transform: [{ translateY: panYProfile }], backgroundColor: theme.background },
                    ]}
                >
                    <View {...panResponderProfile.panHandlers} style={styles.swipeHandleWrapper}>
                        <View style={styles.swipeHandle} />
                    </View>

                    <View {...panResponderProfile.panHandlers} style={[styles.header, { justifyContent: 'center' }]}>
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
                                setTheme={setTheme as any}
                                colorScheme={colorScheme}
                            />

                            <ProfileMenuItem
                                icon={<User size={20} color="#2563EB" />}
                                title="Manage Profile"
                                subtitle="Account settings & details"
                                iconBgColor={colorScheme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF'}
                                onPress={() => router.push('/profile')}
                                theme={theme}
                            />

                            <ProfileMenuItem
                                icon={<Globe size={20} color="#059669" />}
                                title="Translation Language"
                                subtitle={toLanguageLabel(state.language)}
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
                            panY={panY}
                            panHandlers={panResponder.panHandlers}
                            onClose={closeLangModal}
                            onSelectLanguage={(code) => {
                                state.setLanguage(toTargetLanguage(code));
                                closeLangModal();
                            }}
                        />

                        <HapticTouchableOpacity
                            onPress={() => void state.handleUpdate(onUpdate, onClose)}
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
