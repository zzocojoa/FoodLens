import React from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LogOut } from 'lucide-react-native';

import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { completeTopLevelTabSwitchTrace } from '@/components/navigation/tabSwitchTrace';
import TopLevelScreenShell, {
    getTopLevelScreenBottomPadding,
} from '@/components/navigation/TopLevelScreenShell';
import { Colors } from '@/constants/theme';
import { CanonicalLocale, useI18n } from '@/features/i18n';
import { HomeBackgroundAtmosphere } from '@/features/home/components/HomeBackgroundAtmosphere';
import { homeDashboardColors } from '@/features/home/components/homeDashboardTokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { normalizeTravelerTargetLanguage } from '@/services/travelerCardLanguage';
import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser';
import { AuthApi } from '@/services/auth/authApi';
import { AuthSecureSessionStore } from '@/services/auth/secureSessionStore';
import { clearLocalLogoutFootprint } from '@/services/auth/localFootprint';
import { logoutFromOAuthProvider } from '@/services/auth/providerLogout';
import { getBuildFingerprint } from '@/services/buildFingerprint';
import { dispatchPhase2SyncQueue } from '@/services/sync/phase2SyncQueue';
import LogoutConfirmationDialog from '@/features/profile/components/LogoutConfirmationDialog';
import { isOnboardingPreviewEnabled } from '@/features/onboarding/services/onboardingPreviewService';

import LanguageSelectorModal from '../profileHub/components/LanguageSelectorModal';
import ProfileDeveloperSheet from '../profileHub/components/ProfileDeveloperSheet';
import ProfileIdentitySummaryCard from '../profileHub/components/ProfileIdentitySummaryCard';
import ProfileSafetyPassportSection from '../profileHub/components/ProfileSafetyPassportSection';
import ProfileSupportDeskCard from '../profileHub/components/ProfileSupportDeskCard';
import ProfileTravelModeSection from '../profileHub/components/ProfileTravelModeSection';
import { LANGUAGE_OPTIONS, UI_LANGUAGE_OPTIONS } from '../profileHub/constants';
import { useProfileHubController } from '../profileHub/hooks/useProfileHubController';
import { buildProfileEditRoute } from '../profileHub/utils/profileEditRoute';
import { toLanguageLabel, toTargetLanguage, toUiLanguageLabel } from '../profileHub/utils/profileHubUtils';

const profileHubStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: homeDashboardColors.paper,
    },
    containerDark: {
        backgroundColor: Colors.dark.background,
    },
    safeArea: {
        flex: 1,
        backgroundColor: homeDashboardColors.paper,
    },
    safeAreaDark: {
        backgroundColor: Colors.dark.background,
    },
    scrollContent: {
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: 8,
    },
    topChrome: {
        paddingHorizontal: 20,
        paddingTop: 6,
        paddingBottom: 6,
    },
    navigationRow: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        minHeight: 44,
    },
    navigationSlot: {
        flex: 1,
    },
    navigationTitle: {
        color: homeDashboardColors.ink,
        flex: 1,
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: -0.3,
        lineHeight: 20,
        textAlign: 'center',
    },
    navigationTitleDark: {
        color: Colors.dark.textPrimary,
    },
    logoutButton: {
        alignItems: 'center',
        alignSelf: 'center',
        backgroundColor: 'rgba(255, 252, 247, 0.72)',
        borderColor: 'rgba(185, 70, 62, 0.18)',
        borderCurve: 'continuous',
        borderRadius: 18,
        borderWidth: 1,
        marginTop: 2,
        minHeight: 44,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    logoutButtonDark: {
        backgroundColor: 'rgba(16, 23, 37, 0.82)',
        borderColor: 'rgba(185, 70, 62, 0.24)',
    },
    logoutButtonDisabled: {
        opacity: 0.72,
    },
    logoutContent: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    logoutText: {
        color: homeDashboardColors.accentRed,
        fontSize: 15,
        fontWeight: '700',
        lineHeight: 18,
    },
    logoutTextDark: {
        color: 'rgba(255, 231, 229, 0.92)',
    },
    qaPreviewButton: {
        backgroundColor: 'rgba(57, 110, 203, 0.11)',
        borderColor: 'rgba(57, 110, 203, 0.24)',
        borderCurve: 'continuous',
        borderRadius: 20,
        borderWidth: 1,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    qaPreviewButtonDark: {
        backgroundColor: 'rgba(86, 145, 255, 0.16)',
        borderColor: 'rgba(132, 175, 255, 0.28)',
    },
    qaPreviewEyebrow: {
        color: homeDashboardColors.accentBlue,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.6,
        lineHeight: 14,
        textTransform: 'uppercase',
    },
    qaPreviewEyebrowDark: {
        color: 'rgba(174, 204, 255, 0.92)',
    },
    qaPreviewTitle: {
        color: homeDashboardColors.ink,
        fontSize: 15,
        fontWeight: '800',
        lineHeight: 19,
        marginTop: 4,
    },
    qaPreviewTitleDark: {
        color: Colors.dark.textPrimary,
    },
    qaPreviewSubtitle: {
        color: homeDashboardColors.inkSoft,
        fontSize: 13,
        fontWeight: '600',
        lineHeight: 18,
        marginTop: 3,
    },
    qaPreviewSubtitleDark: {
        color: Colors.dark.textSecondary,
    },
});

const MemoizedProfileIdentitySummaryCard = React.memo(ProfileIdentitySummaryCard);
const MemoizedProfileSafetyPassportSection = React.memo(ProfileSafetyPassportSection);
const MemoizedProfileSupportDeskCard = React.memo(ProfileSupportDeskCard);

MemoizedProfileIdentitySummaryCard.displayName = 'ProfileHubIdentitySummaryCard';
MemoizedProfileSafetyPassportSection.displayName = 'ProfileHubSafetyPassportSection';
MemoizedProfileSupportDeskCard.displayName = 'ProfileHubSupportDeskCard';

export default function ProfileHubScreen(): React.JSX.Element {
    const router = useRouter();
    const isFocused = useIsFocused();
    const insets = useSafeAreaInsets();
    const { t } = useI18n();
    const colorScheme = useColorScheme();
    const resolvedColorScheme = colorScheme === 'dark' ? 'dark' : 'light';
    const isDarkTheme = resolvedColorScheme === 'dark';
    const palette = Colors[resolvedColorScheme];
    const userId = getCurrentUserIdSnapshot();
    const { state, travelerLanguageSheet, uiLanguageSheet } = useProfileHubController({ userId });
    const {
        image,
        name,
        setTravelerLanguage,
        setTravelerLangModalVisible,
        setUiLanguage,
        setUiLangModalVisible,
        travelerLanguage,
        travelerLangModalVisible,
        uiLanguage,
        uiLangModalVisible,
    } = state;
    const [logoutLoading, setLogoutLoading] = React.useState<boolean>(false);
    const [logoutDialogVisible, setLogoutDialogVisible] = React.useState<boolean>(false);
    const [isBuildFingerprintVisible, setIsBuildFingerprintVisible] = React.useState<boolean>(false);
    const buildFingerprint = React.useMemo(() => getBuildFingerprint(), []);
    const canRevealBuildFingerprint = buildFingerprint.installTrack !== 'production';
    const canOpenOnboardingPreview = isOnboardingPreviewEnabled();

    const travelerOptions = React.useMemo(
        () =>
            LANGUAGE_OPTIONS.map((option) => ({
                ...option,
                label: t(`profileHub.travelerLanguage.option.${option.code}`),
            })),
        [t],
    );
    const settingsLanguageOptions = React.useMemo(
        () =>
            UI_LANGUAGE_OPTIONS.map((option) => ({
                ...option,
                label: t(`profileHub.settingsLanguage.option.${option.code}`),
            })),
        [t],
    );
    const travelerAutoLabel = React.useMemo(() => {
        const autoOption = travelerOptions.find((option) => option.code === 'auto');

        if (!autoOption) {
            throw new Error('profileHub traveler auto option is missing');
        }

        return autoOption.label;
    }, [travelerOptions]);
    const settingsAutoLabel = React.useMemo(() => {
        const autoOption = settingsLanguageOptions.find((option) => option.code === 'auto');

        if (!autoOption) {
            throw new Error('profileHub settings auto option is missing');
        }

        return autoOption.label;
    }, [settingsLanguageOptions]);
    const travelerLanguageLabel = React.useMemo(() => {
        return toLanguageLabel({
            language: travelerLanguage,
            fallbackLabel: travelerAutoLabel,
            options: travelerOptions,
        });
    }, [travelerAutoLabel, travelerLanguage, travelerOptions]);
    const settingsLanguageLabel = React.useMemo(() => {
        return toUiLanguageLabel({
            language: uiLanguage,
            fallbackLabel: settingsAutoLabel,
            options: settingsLanguageOptions,
        });
    }, [settingsAutoLabel, settingsLanguageOptions, uiLanguage]);
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
                value: buildFingerprint.gitDirty
                    ? t('profileHub.buildFingerprint.yes', 'Yes')
                    : t('profileHub.buildFingerprint.no', 'No'),
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

    const handleOpenOnboardingPreview = React.useCallback(() => {
        router.push({
            pathname: '/onboarding',
            params: { preview: '1' },
        });
    }, [router]);

    const handleOpenTravelerLanguage = React.useCallback(() => {
        setTravelerLangModalVisible(true);
    }, [setTravelerLangModalVisible]);

    const handleOpenUiLanguage = React.useCallback(() => {
        setUiLangModalVisible(true);
    }, [setUiLangModalVisible]);

    const handleOpenEditProfile = React.useCallback(() => {
        router.push(
            buildProfileEditRoute({
                name,
                image,
            }),
        );
    }, [image, name, router]);

    const handleRevealBuildFingerprint = React.useCallback(() => {
        if (!canRevealBuildFingerprint) {
            return;
        }

        setIsBuildFingerprintVisible(true);
    }, [canRevealBuildFingerprint]);

    const handleCloseBuildFingerprint = React.useCallback(() => {
        setIsBuildFingerprintVisible(false);
    }, []);

    React.useEffect(() => {
        if (!isFocused) {
            return;
        }

        completeTopLevelTabSwitchTrace({
            target: 'profile',
            details: {
                hasImage: Boolean(image),
                travelerLanguage: travelerLanguage ?? null,
                uiLanguage,
            },
        });
    }, [image, isFocused, travelerLanguage, uiLanguage]);

    const handleOpenLogoutDialog = React.useCallback((): void => {
        if (logoutLoading) {
            return;
        }

        setLogoutDialogVisible(true);
    }, [logoutLoading]);

    const handleCancelLogoutDialog = React.useCallback((): void => {
        setLogoutDialogVisible(false);
    }, []);

    const handleLogout = React.useCallback(async () => {
        if (logoutLoading) {
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
            try {
                await clearLocalLogoutFootprint();
            } catch (error) {
                console.error('[AuthSession] Local logout footprint wipe failed', {
                    request_id: requestId,
                    provider: provider ?? 'none',
                    error: error instanceof Error ? error.message : String(error),
                });
                Alert.alert(
                    t('profileHub.logout.localClearFailed.title', 'Logout incomplete'),
                    t(
                        'profileHub.logout.localClearFailed.message',
                        'This device could not be cleared. Please try logging out again before handing over the device.',
                    ),
                );
                return;
            }
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
    }, [logoutLoading, router, t]);

    const handleConfirmLogoutDialog = React.useCallback((): void => {
        setLogoutDialogVisible(false);
        void handleLogout();
    }, [handleLogout]);

    return (
        <TopLevelScreenShell
            activeItem="profile"
            backgroundColor={isDarkTheme ? palette.background : homeDashboardColors.paper}
            hideNav={false}
        >
            <View style={[profileHubStyles.container, isDarkTheme ? profileHubStyles.containerDark : null]}>
                {isDarkTheme ? null : <HomeBackgroundAtmosphere />}
                <StatusBar style={resolvedColorScheme === 'dark' ? 'light' : 'dark'} />
                <Stack.Screen options={{ headerShown: false }} />

                <SafeAreaView
                    style={[profileHubStyles.safeArea, isDarkTheme ? profileHubStyles.safeAreaDark : null]}
                    edges={['top']}
                >
                    <View style={profileHubStyles.topChrome}>
                        <View style={profileHubStyles.navigationRow}>
                            <View style={profileHubStyles.navigationSlot} />
                            <Text
                                style={[
                                    profileHubStyles.navigationTitle,
                                    isDarkTheme ? profileHubStyles.navigationTitleDark : null,
                                ]}
                            >
                                {t('profileAtelier.rail.title', 'Profile')}
                            </Text>
                            <View style={profileHubStyles.navigationSlot} />
                        </View>
                    </View>

                    <ScrollView
                        contentInsetAdjustmentBehavior="automatic"
                        contentContainerStyle={[
                            profileHubStyles.scrollContent,
                            { paddingBottom: getTopLevelScreenBottomPadding(insets.bottom, 12) },
                        ]}
                        keyboardDismissMode="on-drag"
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <MemoizedProfileIdentitySummaryCard
                            colorScheme={resolvedColorScheme}
                            image={image}
                            name={name}
                            onLongPressPortrait={
                                canRevealBuildFingerprint ? handleRevealBuildFingerprint : undefined
                            }
                            onPressEdit={handleOpenEditProfile}
                        />

                        <MemoizedProfileSafetyPassportSection
                            colorScheme={resolvedColorScheme}
                            languageLabel={travelerLanguageLabel}
                            onPressHealthProfile={handleOpenHealthProfile}
                            onPressTravelerLanguage={handleOpenTravelerLanguage}
                        />

                        <ProfileTravelModeSection
                            appLanguageLabel={settingsLanguageLabel}
                            colorScheme={resolvedColorScheme}
                            onPressAppLanguage={handleOpenUiLanguage}
                        />

                        <MemoizedProfileSupportDeskCard
                            colorScheme={resolvedColorScheme}
                            onPress={handleOpenSupportHub}
                        />

                        {canOpenOnboardingPreview ? (
                            <HapticTouchableOpacity
                                accessibilityHint={t(
                                    'profileHub.qaPreview.accessibilityHint',
                                    'Open the onboarding preview without changing your saved profile.'
                                )}
                                accessibilityLabel={t(
                                    'profileHub.qaPreview.accessibilityLabel',
                                    'Open onboarding preview'
                                )}
                                accessibilityRole="button"
                                activeOpacity={0.9}
                                hapticType="selection"
                                onPress={handleOpenOnboardingPreview}
                                style={[
                                    profileHubStyles.qaPreviewButton,
                                    isDarkTheme ? profileHubStyles.qaPreviewButtonDark : null,
                                ]}
                                testID="profile-onboarding-preview-action"
                            >
                                <Text
                                    style={[
                                        profileHubStyles.qaPreviewEyebrow,
                                        isDarkTheme ? profileHubStyles.qaPreviewEyebrowDark : null,
                                    ]}
                                >
                                    {t('profileHub.qaPreview.eyebrow', 'QA only')}
                                </Text>
                                <Text
                                    style={[
                                        profileHubStyles.qaPreviewTitle,
                                        isDarkTheme ? profileHubStyles.qaPreviewTitleDark : null,
                                    ]}
                                >
                                    {t('profileHub.qaPreview.title', 'Preview onboarding')}
                                </Text>
                                <Text
                                    style={[
                                        profileHubStyles.qaPreviewSubtitle,
                                        isDarkTheme ? profileHubStyles.qaPreviewSubtitleDark : null,
                                    ]}
                                >
                                    {t(
                                        'profileHub.qaPreview.subtitle',
                                        'Review the Safety Passport flow without saving profile changes.'
                                    )}
                                </Text>
                            </HapticTouchableOpacity>
                        ) : null}

                        <HapticTouchableOpacity
                            accessibilityHint={t('profileHub.menu.logout.hint')}
                            accessibilityLabel={t('profileHub.menu.logout.title', 'Log out')}
                            accessibilityRole="button"
                            activeOpacity={0.9}
                            disabled={logoutLoading}
                            hapticType="selection"
                            onPress={handleOpenLogoutDialog}
                            style={[
                                profileHubStyles.logoutButton,
                                isDarkTheme ? profileHubStyles.logoutButtonDark : null,
                                logoutLoading ? profileHubStyles.logoutButtonDisabled : null,
                            ]}
                        >
                            <View style={profileHubStyles.logoutContent}>
                                <LogOut color={homeDashboardColors.accentRed} size={16} />
                                <Text
                                    style={[
                                        profileHubStyles.logoutText,
                                        isDarkTheme ? profileHubStyles.logoutTextDark : null,
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
                        colorScheme={resolvedColorScheme}
                        normalizeForSelection={normalizeTravelerTargetLanguage}
                        onClose={travelerLanguageSheet.closeSheet}
                        onSelectLanguage={(code) => {
                            setTravelerLanguage(toTargetLanguage(code));
                            travelerLanguageSheet.closeSheet();
                        }}
                        options={travelerOptions}
                        panHandlers={travelerLanguageSheet.panResponder.panHandlers}
                        panY={travelerLanguageSheet.panY}
                        selectedCode={travelerLanguage}
                        theme={palette}
                        title={t('profileAtelier.safety.cardLanguage', 'Card Language')}
                        visible={travelerLangModalVisible}
                    />

                    <LanguageSelectorModal
                        colorScheme={resolvedColorScheme}
                        onClose={uiLanguageSheet.closeSheet}
                        onSelectLanguage={(code) => {
                            setUiLanguage(code as CanonicalLocale);
                            uiLanguageSheet.closeSheet();
                        }}
                        options={settingsLanguageOptions}
                        panHandlers={uiLanguageSheet.panResponder.panHandlers}
                        panY={uiLanguageSheet.panY}
                        selectedCode={uiLanguage}
                        theme={palette}
                        title={t('profileAtelier.travel.appLanguage', 'App Language')}
                        visible={uiLangModalVisible}
                    />

                    <ProfileDeveloperSheet
                        closeLabel={t('profileAtelier.developer.close', 'Close')}
                        colorScheme={resolvedColorScheme}
                        onClose={handleCloseBuildFingerprint}
                        rows={buildFingerprintRows}
                        theme={palette}
                        title={t('profileAtelier.developer.title', 'Developer Info')}
                        visible={canRevealBuildFingerprint && isBuildFingerprintVisible}
                    />

                    <LogoutConfirmationDialog
                        cancelAccessibilityHint={t('profileHub.logout.cancelAccessibilityHint')}
                        cancelAccessibilityLabel={t('profileHub.logout.cancelAccessibilityLabel')}
                        cancelLabel={t('common.cancel')}
                        colorScheme={resolvedColorScheme}
                        confirmAccessibilityHint={t('profileHub.logout.confirmAccessibilityHint')}
                        confirmAccessibilityLabel={t('profileHub.logout.confirmAccessibilityLabel')}
                        confirmLabel={t('profileHub.menu.logout.title')}
                        dialogAccessibilityLabel={t('profileHub.logout.dialogAccessibilityLabel')}
                        message={t('profileHub.logout.confirmMessage')}
                        onCancel={handleCancelLogoutDialog}
                        onConfirm={handleConfirmLogoutDialog}
                        title={t('profileHub.logout.confirmTitle')}
                        visible={logoutDialogVisible}
                    />
                </SafeAreaView>
            </View>
        </TopLevelScreenShell>
    );
}
