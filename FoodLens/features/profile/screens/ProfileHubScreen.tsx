import React from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Globe, LogOut, Shield, User } from 'lucide-react-native';

import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import TopLevelScreenShell, {
    getTopLevelScreenBottomPadding,
} from '@/components/navigation/TopLevelScreenShell';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/features/i18n';
import { CanonicalLocale } from '@/features/i18n';
import { normalizeTravelerTargetLanguage } from '@/services/travelerCardLanguage';
import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser';
import { AuthApi } from '@/services/auth/authApi';
import { AuthSecureSessionStore } from '@/services/auth/secureSessionStore';
import { clearSession } from '@/services/auth/sessionManager';
import { logoutFromOAuthProvider } from '@/services/auth/providerLogout';
import { getBuildFingerprint } from '@/services/buildFingerprint';
import { dispatchPhase2SyncQueue } from '@/services/sync/phase2SyncQueue';
import { Colors } from '@/constants/theme';
import AnimatedThemeToggle from '../profileHub/components/AnimatedThemeToggle';
import LanguageSelectorModal from '../profileHub/components/LanguageSelectorModal';
import ProfileIdentitySection from '../profileHub/components/ProfileIdentitySection';
import ProfileMenuItem from '../profileHub/components/ProfileMenuItem';
import { LANGUAGE_OPTIONS, UI_LANGUAGE_OPTIONS } from '../profileHub/constants';
import { useProfileHubController } from '../profileHub/hooks/useProfileHubController';
import { profileHubStyles as sharedProfileHubStyles } from '../profileHub/styles';
import { toLanguageLabel, toTargetLanguage, toUiLanguageLabel } from '../profileHub/utils/profileHubUtils';

const profileHubStyles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: '900',
        letterSpacing: -0.4,
    },
    content: {
        paddingHorizontal: 24,
        paddingTop: 8,
    },
    logoutButton: {
        marginTop: 16,
        borderRadius: 20,
        paddingVertical: 15,
        alignItems: 'center',
        borderWidth: 1,
    },
    logoutButtonText: {
        fontSize: 15,
        fontWeight: '700',
    },
    buildSection: {
        marginTop: 16,
        borderRadius: 24,
        borderWidth: 1,
        paddingHorizontal: 20,
        paddingVertical: 18,
        gap: 10,
    },
    buildSectionTitle: {
        fontSize: 14,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
    buildRow: {
        gap: 4,
        paddingBottom: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    buildLabel: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
    buildValue: {
        fontSize: 13,
        fontWeight: '600',
        lineHeight: 18,
    },
});

export default function ProfileHubScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { t } = useI18n();
    const { theme: currentTheme, setTheme, colorScheme } = useTheme();
    const resolvedColorScheme = colorScheme === 'dark' ? 'dark' : 'light';
    const theme = Colors[resolvedColorScheme];
    const userId = getCurrentUserIdSnapshot();
    const { state, travelerLanguageSheet, uiLanguageSheet } = useProfileHubController({ userId });
    const [logoutLoading, setLogoutLoading] = React.useState(false);
    const buildFingerprint = React.useMemo(() => getBuildFingerprint(), []);

    const travelerOptions = React.useMemo(
        () =>
            LANGUAGE_OPTIONS.map((option) => ({
                ...option,
                label: t(`profileHub.travelerLanguage.option.${option.code}`, option.label),
            })),
        [t],
    );
    const settingsLanguageOptions = React.useMemo(
        () =>
            UI_LANGUAGE_OPTIONS.map((option) => ({
                ...option,
                label: t(`profileHub.settingsLanguage.option.${option.code}`, option.label),
            })),
        [t],
    );
    const buildFingerprintRows = React.useMemo(
        () => [
            { label: t('profileHub.buildFingerprint.version', 'Version'), value: buildFingerprint.version },
            { label: t('profileHub.buildFingerprint.source', 'Source'), value: buildFingerprint.buildSourceLabel },
            { label: t('profileHub.buildFingerprint.worktree', 'Worktree'), value: buildFingerprint.worktreeName },
            { label: t('profileHub.buildFingerprint.track', 'Install track'), value: buildFingerprint.installTrack },
            {
                label: t('profileHub.buildFingerprint.package', 'Package'),
                value: Platform.OS === 'ios' ? buildFingerprint.iosBundleIdentifier : buildFingerprint.androidPackage,
            },
            { label: t('profileHub.buildFingerprint.branch', 'Branch'), value: buildFingerprint.gitBranch },
            { label: t('profileHub.buildFingerprint.commit', 'Commit'), value: buildFingerprint.gitCommitShortSha },
            {
                label: t('profileHub.buildFingerprint.dirty', 'Dirty worktree'),
                value: buildFingerprint.gitDirty ? t('profileHub.buildFingerprint.yes', 'Yes') : t('profileHub.buildFingerprint.no', 'No'),
            },
            { label: t('profileHub.buildFingerprint.builtAt', 'Built at'), value: buildFingerprint.builtAtIso },
        ],
        [buildFingerprint, t],
    );

    const handleOpenHealthProfile = React.useCallback(() => {
        router.push('/health-profile' as never);
    }, [router]);

    const handleOpenSupportHub = React.useCallback(() => {
        router.push('/support-policies');
    }, [router]);

    const handleUpdateProfile = React.useCallback(() => {
        void state.handleUpdate(() => undefined, () => undefined);
    }, [state]);

    const confirmLogoutIntent = React.useCallback(async (): Promise<boolean> => {
        return new Promise((resolve) => {
            Alert.alert(
                t('profileHub.logout.confirmTitle', 'Log out?'),
                t('profileHub.logout.confirmMessage', 'You will be logged out and moved to the login screen.'),
                [
                    { text: t('common.cancel', 'Cancel'), style: 'cancel', onPress: () => resolve(false) },
                    { text: t('profileSheet.menu.logout.title', 'Log out'), style: 'destructive', onPress: () => resolve(true) },
                ],
            );
        });
    }, [t]);

    const handleLogout = React.useCallback(async () => {
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
    }, [confirmLogoutIntent, logoutLoading, router]);

    return (
        <TopLevelScreenShell
            activeItem="profile"
            backgroundColor={theme.background}
            hideNav={false}
        >
            <View style={[profileHubStyles.container, { backgroundColor: theme.background }]}>
                <StatusBar style={resolvedColorScheme === 'dark' ? 'light' : 'dark'} />
                <Stack.Screen options={{ headerShown: false }} />

                <SafeAreaView style={{ flex: 1 }} edges={['top']}>
                    <View style={profileHubStyles.header}>
                        <Text style={[profileHubStyles.title, { color: theme.textPrimary }]}>
                            {t('profileHub.title', 'Profile')}
                        </Text>
                    </View>

                    <ScrollView
                        contentContainerStyle={[
                            profileHubStyles.content,
                            { paddingBottom: getTopLevelScreenBottomPadding(insets.bottom, 0) },
                        ]}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="always"
                        keyboardDismissMode="on-drag"
                    >
                        <ProfileIdentitySection
                            theme={theme}
                            colorScheme={resolvedColorScheme}
                            name={state.name}
                            image={state.image}
                            avatars={state.avatars}
                            onChangeName={state.setName}
                            onClearName={() => state.setName('')}
                            onPickCamera={() => void state.pickImage(true)}
                            onPickLibrary={() => void state.pickImage(false)}
                            onSelectPreset={state.setImage}
                        />

                        <View style={sharedProfileHubStyles.section}>
                            <AnimatedThemeToggle
                                theme={theme}
                                currentTheme={currentTheme}
                                setTheme={setTheme}
                                colorScheme={resolvedColorScheme}
                            />

                            <ProfileMenuItem
                                icon={<User size={20} color="#2563EB" />}
                                title={t('profileHub.menu.manageProfile.title', 'Health Profile')}
                                subtitle={t('profileHub.menu.manageProfile.subtitle', 'Allergies, severity & dietary restrictions')}
                                iconBgColor={resolvedColorScheme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF'}
                                onPress={handleOpenHealthProfile}
                                theme={theme}
                            />

                            <ProfileMenuItem
                                icon={<Shield size={20} color="#2563EB" />}
                                title={t('profileHub.menu.supportHub.title', 'Support & Policies')}
                                subtitle={t('profileHub.menu.supportHub.subtitle', 'Help, legal documents & account data')}
                                iconBgColor={resolvedColorScheme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF'}
                                onPress={handleOpenSupportHub}
                                theme={theme}
                            />

                            <ProfileMenuItem
                                icon={<Globe size={20} color="#059669" />}
                                title={t('profileHub.menu.travelerLanguage.title', 'Traveler Card Language')}
                                subtitle={t('profileHub.menu.travelerLanguage.subtitleTemplate', '{language} • Result card only').replace(
                                    '{language}',
                                    toLanguageLabel(state.travelerLanguage),
                                )}
                                iconBgColor={resolvedColorScheme === 'dark' ? 'rgba(5, 150, 105, 0.2)' : '#ECFDF5'}
                                onPress={() => state.setTravelerLangModalVisible(true)}
                                theme={theme}
                            />

                            <ProfileMenuItem
                                icon={<Globe size={20} color="#2563EB" />}
                                title={t('profileHub.menu.settingsLanguage.title', 'Settings Language')}
                                subtitle={toUiLanguageLabel(state.uiLanguage)}
                                iconBgColor={resolvedColorScheme === 'dark' ? 'rgba(37, 99, 235, 0.2)' : '#EFF6FF'}
                                onPress={() => state.setUiLangModalVisible(true)}
                                theme={theme}
                            />
                        </View>

                        <HapticTouchableOpacity
                            onPress={handleUpdateProfile}
                            disabled={state.loading}
                            style={[
                                sharedProfileHubStyles.saveButton,
                                { backgroundColor: theme.textPrimary, shadowColor: theme.shadow },
                            ]}
                            hapticType="success"
                        >
                            <Text style={[sharedProfileHubStyles.saveText, { color: theme.background }]}>
                                {t('profileHub.action.updateProfile', 'UPDATE PROFILE')}
                            </Text>
                        </HapticTouchableOpacity>

                        <View
                            style={[
                                profileHubStyles.buildSection,
                                {
                                    backgroundColor: theme.surface,
                                    borderColor: theme.border,
                                },
                            ]}
                        >
                            <Text style={[profileHubStyles.buildSectionTitle, { color: theme.textPrimary }]}>
                                {t('profileHub.buildFingerprint.title', 'Build Fingerprint')}
                            </Text>
                            {buildFingerprintRows.map((row, index) => (
                                <View
                                    key={row.label}
                                    style={[
                                        profileHubStyles.buildRow,
                                        {
                                            borderBottomColor: theme.border,
                                            paddingBottom: index === buildFingerprintRows.length - 1 ? 0 : 10,
                                            borderBottomWidth:
                                                index === buildFingerprintRows.length - 1 ? 0 : StyleSheet.hairlineWidth,
                                        },
                                    ]}
                                >
                                    <Text style={[profileHubStyles.buildLabel, { color: theme.textSecondary }]}>
                                        {row.label}
                                    </Text>
                                    <Text selectable style={[profileHubStyles.buildValue, { color: theme.textPrimary }]}>
                                        {row.value}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        <HapticTouchableOpacity
                            onPress={() => void handleLogout()}
                            disabled={logoutLoading}
                            accessibilityRole="button"
                            accessibilityLabel={t('profileHub.menu.logout.title', 'Log out')}
                            style={[
                                profileHubStyles.logoutButton,
                                {
                                    borderColor: resolvedColorScheme === 'dark' ? 'rgba(248, 113, 113, 0.4)' : '#FCA5A5',
                                    backgroundColor: resolvedColorScheme === 'dark' ? 'rgba(248, 113, 113, 0.08)' : '#FEF2F2',
                                },
                            ]}
                            hapticType="selection"
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <LogOut size={16} color={resolvedColorScheme === 'dark' ? '#FCA5A5' : '#B91C1C'} />
                                <Text
                                    style={[
                                        profileHubStyles.logoutButtonText,
                                        { color: resolvedColorScheme === 'dark' ? '#FCA5A5' : '#B91C1C' },
                                    ]}
                                >
                                    {logoutLoading
                                        ? t('profileHub.menu.logout.loading', 'Signing out...')
                                        : t('profileHub.menu.logout.title', 'Log out')}
                                </Text>
                            </View>
                        </HapticTouchableOpacity>
                    </ScrollView>

                    <LanguageSelectorModal
                        visible={state.travelerLangModalVisible}
                        title={t('profileHub.travelerLanguage.modalTitle', 'Traveler Card Language')}
                        options={travelerOptions}
                        selectedCode={state.travelerLanguage}
                        colorScheme={resolvedColorScheme}
                        theme={theme}
                        panY={travelerLanguageSheet.panY}
                        panHandlers={travelerLanguageSheet.panResponder.panHandlers}
                        onClose={travelerLanguageSheet.closeSheet}
                        onSelectLanguage={(code) => {
                            state.setTravelerLanguage(toTargetLanguage(code));
                            travelerLanguageSheet.closeSheet();
                        }}
                        normalizeForSelection={normalizeTravelerTargetLanguage}
                    />

                    <LanguageSelectorModal
                        visible={state.uiLangModalVisible}
                        title={t('profileHub.settingsLanguage.modalTitle', 'Settings Language')}
                        options={settingsLanguageOptions}
                        selectedCode={state.uiLanguage}
                        colorScheme={resolvedColorScheme}
                        theme={theme}
                        panY={uiLanguageSheet.panY}
                        panHandlers={uiLanguageSheet.panResponder.panHandlers}
                        onClose={uiLanguageSheet.closeSheet}
                        onSelectLanguage={(code) => {
                            state.setUiLanguage(code as CanonicalLocale);
                            uiLanguageSheet.closeSheet();
                        }}
                    />
                </SafeAreaView>
            </View>
        </TopLevelScreenShell>
    );
}
