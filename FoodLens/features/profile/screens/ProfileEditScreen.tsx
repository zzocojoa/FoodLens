import React from 'react';
import {
    ActivityIndicator,
    InteractionManager,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Camera, ChevronRight, X } from 'lucide-react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { SecureImage } from '@/components/SecureImage';
import TopLevelScreenShell from '@/components/navigation/TopLevelScreenShell';
import { Colors } from '@/constants/theme';
import { useI18n } from '@/features/i18n';
import { HomeBackgroundAtmosphere } from '@/features/home/components/HomeBackgroundAtmosphere';
import ProfilePearlSurfaceOverlay from '@/features/home/components/PearlSurfaceOverlay';
import {
    homeDashboardColors,
    homeDashboardRadii,
    homeDashboardSpacing,
} from '@/features/home/components/homeDashboardTokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser';
import { getBuildFingerprint } from '@/services/buildFingerprint';
import { resolveImageUri } from '@/services/imageStorage';

import ProfileDeveloperSheet from '../profileHub/components/ProfileDeveloperSheet';
import { useProfileHubController } from '../profileHub/hooks/useProfileHubController';
import { parseProfileEditSearchParams } from '../profileHub/utils/profileEditRoute';
import type { ProfileEditSearchParams } from '../profileHub/utils/profileEditRoute';

const getInitialGlyph = (name: string): string => {
    const trimmedName = name.trim();

    if (!trimmedName) {
        return 'A';
    }

    return trimmedName[0]?.toUpperCase() ?? 'A';
};

const styles = StyleSheet.create({
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
    contentRoot: {
        flex: 1,
    },
    topChrome: {
        paddingBottom: 6,
        paddingHorizontal: 20,
        paddingTop: 6,
    },
    navigationRow: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        minHeight: 44,
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
    chromeButton: {
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 40,
        minWidth: 52,
    },
    chromeButtonText: {
        color: homeDashboardColors.accentBlue,
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.2,
        lineHeight: 18,
    },
    chromeButtonTextDark: {
        color: homeDashboardColors.pearlIvory,
    },
    chromeButtonDisabled: {
        opacity: 0.7,
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    contentColumn: {
        alignItems: 'center',
        gap: 18,
        width: '100%',
    },
    avatarSection: {
        alignItems: 'center',
        gap: 16,
        paddingTop: 12,
        width: '100%',
    },
    portraitButton: {
        alignItems: 'center',
        gap: 10,
        justifyContent: 'center',
        minHeight: 154,
        position: 'relative',
        width: 150,
    },
    avatarFrame: {
        alignItems: 'center',
        backgroundColor: homeDashboardColors.paperStrong,
        borderColor: 'rgba(58, 45, 31, 0.02)',
        borderRadius: homeDashboardRadii.pill,
        borderWidth: 1,
        height: 116,
        justifyContent: 'center',
        overflow: 'hidden',
        width: 116,
    },
    avatarFrameDark: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    avatarImage: {
        height: '100%',
        width: '100%',
    },
    avatarImageWash: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
    },
    avatarFallback: {
        alignItems: 'center',
        backgroundColor: homeDashboardColors.paperMuted,
        justifyContent: 'center',
    },
    avatarEmpty: {
        alignItems: 'center',
        backgroundColor: homeDashboardColors.paperMuted,
        borderRadius: homeDashboardRadii.pill,
        height: '100%',
        justifyContent: 'center',
        width: '100%',
    },
    avatarEmptyDark: {
        backgroundColor: 'rgba(17, 24, 39, 0.92)',
    },
    avatarGlyph: {
        color: homeDashboardColors.inkSoft,
        fontSize: 34,
        fontWeight: '700',
        letterSpacing: -0.8,
        lineHeight: 38,
    },
    avatarGlyphDark: {
        color: 'rgba(255, 255, 255, 0.88)',
    },
    cameraButton: {
        alignItems: 'center',
        backgroundColor: homeDashboardColors.accentBlue,
        borderColor: homeDashboardColors.paper,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.pill,
        borderWidth: 3,
        bottom: 38,
        height: 38,
        justifyContent: 'center',
        position: 'absolute',
        right: 14,
        width: 38,
    },
    cameraButtonDark: {
        backgroundColor: '#16B9D4',
        borderColor: Colors.dark.background,
        opacity: 1,
    },
    avatarActionButton: {
        alignItems: 'center',
        backgroundColor: 'rgba(255, 252, 247, 0.88)',
        borderColor: homeDashboardColors.line,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.pill,
        borderWidth: 1,
        minHeight: 36,
        justifyContent: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    avatarActionButtonDark: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    avatarActionText: {
        color: homeDashboardColors.accentBlue,
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.3,
        lineHeight: 18,
        textAlign: 'center',
    },
    avatarActionTextDark: {
        color: '#72DDF2',
    },
    nameCardButton: {
        width: '100%',
    },
    nameCard: {
        alignItems: 'center',
        alignSelf: 'stretch',
        backgroundColor: 'rgba(255, 255, 255, 0.94)',
        borderColor: 'rgba(58, 45, 31, 0.08)',
        borderCurve: 'continuous',
        borderRadius: 20,
        borderWidth: 1,
        flexDirection: 'row',
        minHeight: 56,
        paddingHorizontal: 16,
    },
    nameCardDark: {
        backgroundColor: 'rgba(17, 24, 39, 0.94)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    nameLabel: {
        color: homeDashboardColors.ink,
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.35,
        lineHeight: 20,
        width: 42,
    },
    nameLabelDark: {
        color: homeDashboardColors.pearlIvory,
    },
    nameInput: {
        color: homeDashboardColors.ink,
        flex: 1,
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: -0.35,
        lineHeight: 22,
        marginHorizontal: 6,
        minWidth: 0,
        paddingVertical: 0,
        textAlign: 'center',
    },
    nameInputDark: {
        color: homeDashboardColors.pearlIvory,
    },
    nameChevron: {
        marginLeft: 6,
    },
    actionSheetOverlay: {
        backgroundColor: 'rgba(23, 32, 51, 0.22)',
        flex: 1,
        justifyContent: 'flex-end',
    },
    actionSheetDismissArea: {
        flex: 1,
    },
    actionSheetSafeArea: {
        justifyContent: 'flex-end',
    },
    actionSheetContainer: {
        backgroundColor: homeDashboardColors.surfaceStrong,
        borderColor: homeDashboardColors.line,
        borderTopLeftRadius: homeDashboardRadii.xl,
        borderTopRightRadius: homeDashboardRadii.xl,
        borderWidth: 1,
        overflow: 'hidden',
        paddingHorizontal: homeDashboardSpacing.md,
        paddingTop: homeDashboardSpacing.xs,
    },
    actionSheetContainerDark: {
        backgroundColor: 'rgba(12, 18, 30, 0.98)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    actionSheetContent: {
        gap: homeDashboardSpacing.sm,
        paddingBottom: homeDashboardSpacing.xxl,
        zIndex: 1,
    },
    actionSheetHandle: {
        alignSelf: 'center',
        backgroundColor: homeDashboardColors.lineStrong,
        borderRadius: homeDashboardRadii.pill,
        height: 4,
        marginBottom: homeDashboardSpacing.xs,
        width: 40,
    },
    actionSheetHeader: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: homeDashboardSpacing.xs,
    },
    actionSheetTitle: {
        color: homeDashboardColors.ink,
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.4,
        lineHeight: 24,
    },
    actionSheetTitleDark: {
        color: homeDashboardColors.pearlIvory,
    },
    actionSheetCloseButton: {
        alignItems: 'center',
        backgroundColor: 'rgba(255, 252, 247, 0.88)',
        borderColor: homeDashboardColors.line,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.pill,
        borderWidth: 1,
        height: 32,
        justifyContent: 'center',
        width: 32,
    },
    actionSheetCloseButtonDark: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    actionSheetList: {
        gap: homeDashboardSpacing.xs,
        paddingHorizontal: homeDashboardSpacing.xs,
        paddingTop: homeDashboardSpacing.xs,
    },
    actionSheetAction: {
        alignItems: 'center',
        backgroundColor: 'rgba(255, 252, 247, 0.84)',
        borderColor: homeDashboardColors.line,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.lg,
        borderWidth: 1,
        minHeight: 56,
        justifyContent: 'center',
        paddingHorizontal: homeDashboardSpacing.md,
    },
    actionSheetActionDark: {
        backgroundColor: 'rgba(16, 23, 37, 0.84)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    actionSheetActionText: {
        color: homeDashboardColors.ink,
        fontSize: 17,
        fontWeight: '700',
        letterSpacing: -0.3,
        lineHeight: 22,
    },
    actionSheetActionTextDark: {
        color: homeDashboardColors.pearlIvory,
    },
});

export default function ProfileEditScreen(): React.JSX.Element {
    const router = useRouter();
    const params = useLocalSearchParams<ProfileEditSearchParams>();
    const insets = useSafeAreaInsets();
    const { t } = useI18n();
    const colorScheme = useColorScheme();
    const resolvedColorScheme = colorScheme === 'dark' ? 'dark' : 'light';
    const isDarkTheme = resolvedColorScheme === 'dark';
    const userId = getCurrentUserIdSnapshot();
    const initialState = parseProfileEditSearchParams(params);
    const { state } = useProfileHubController({ userId, initialState });
    const [isBuildFingerprintVisible, setIsBuildFingerprintVisible] = React.useState<boolean>(false);
    const [isImageActionSheetVisible, setIsImageActionSheetVisible] = React.useState<boolean>(false);
    const [shouldRenderAtmosphere, setShouldRenderAtmosphere] = React.useState<boolean>(Platform.OS !== 'android');
    const nameInputRef = React.useRef<TextInput>(null);
    const buildFingerprint = React.useMemo(() => getBuildFingerprint(), []);
    const canRevealBuildFingerprint = buildFingerprint.installTrack !== 'production';
    const resolvedImage = React.useMemo(() => {
        if (typeof state.image !== 'string') {
            return undefined;
        }

        const trimmedImage = state.image.trim();
        if (!trimmedImage) {
            return undefined;
        }

        return resolveImageUri(trimmedImage) ?? trimmedImage;
    }, [state.image]);
    const hasImage = typeof resolvedImage === 'string' && resolvedImage.length > 0;

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

    const handleSave = React.useCallback(() => {
        void state.handleUpdate(() => undefined, () => {
            router.back();
        });
    }, [router, state]);

    const handleRevealBuildFingerprint = React.useCallback(() => {
        if (!canRevealBuildFingerprint) {
            return;
        }

        setIsBuildFingerprintVisible(true);
    }, [canRevealBuildFingerprint]);

    const handleOpenImageActionSheet = React.useCallback(() => {
        setIsImageActionSheetVisible(true);
    }, []);

    const handleCloseImageActionSheet = React.useCallback(() => {
        setIsImageActionSheetVisible(false);
    }, []);

    const handleOpenCamera = React.useCallback(() => {
        setIsImageActionSheetVisible(false);
        void state.pickImage(true);
    }, [state]);

    const handleOpenLibrary = React.useCallback(() => {
        setIsImageActionSheetVisible(false);
        void state.pickImage(false);
    }, [state]);

    const handleFocusNameInput = React.useCallback(() => {
        nameInputRef.current?.focus();
    }, []);

    React.useEffect(() => {
        if (Platform.OS !== 'android') {
            return undefined;
        }

        let isMounted = true;
        const task = InteractionManager.runAfterInteractions(() => {
            if (!isMounted) {
                return;
            }

            setShouldRenderAtmosphere(true);
        });

        return () => {
            isMounted = false;
            task.cancel?.();
        };
    }, []);

    return (
        <TopLevelScreenShell
            activeItem="profile"
            backgroundColor={isDarkTheme ? Colors.dark.background : homeDashboardColors.paper}
            hideNav
        >
            <View style={[styles.container, isDarkTheme ? styles.containerDark : null]}>
                {isDarkTheme || !shouldRenderAtmosphere ? null : <HomeBackgroundAtmosphere />}
                <StatusBar style={isDarkTheme ? 'light' : 'dark'} />
                <Stack.Screen options={{ headerShown: false }} />

                <View
                    style={[
                        styles.safeArea,
                        styles.contentRoot,
                        isDarkTheme ? styles.safeAreaDark : null,
                        { paddingTop: insets.top },
                    ]}
                >
                    <View style={styles.topChrome}>
                        <View style={styles.navigationRow}>
                            <HapticTouchableOpacity
                                accessibilityLabel={t('common.cancel', 'Cancel')}
                                accessibilityRole="button"
                                activeOpacity={0.9}
                                hapticType="selection"
                                onPress={() => {
                                    router.back();
                                }}
                                style={styles.chromeButton}
                            >
                                <Text style={[styles.chromeButtonText, isDarkTheme ? styles.chromeButtonTextDark : null]}>
                                    {t('common.cancel', 'Cancel')}
                                </Text>
                            </HapticTouchableOpacity>

                            <Text style={[styles.navigationTitle, isDarkTheme ? styles.navigationTitleDark : null]}>
                                {t('profileAtelier.edit.title', 'Edit Profile')}
                            </Text>

                            <HapticTouchableOpacity
                                accessibilityLabel={t('profileAtelier.hero.action.save', 'Save')}
                                accessibilityRole="button"
                                activeOpacity={0.9}
                                disabled={state.loading}
                                hapticType="selection"
                                onPress={handleSave}
                                style={[styles.chromeButton, state.loading ? styles.chromeButtonDisabled : null]}
                            >
                                {state.loading ? (
                                    <ActivityIndicator color={homeDashboardColors.accentBlue} size="small" />
                                ) : (
                                    <Text style={[styles.chromeButtonText, isDarkTheme ? styles.chromeButtonTextDark : null]}>
                                        {t('profileAtelier.hero.action.save', 'Save')}
                                    </Text>
                                )}
                            </HapticTouchableOpacity>
                        </View>
                    </View>

                    <ScrollView
                        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 28 }]}
                        keyboardDismissMode="on-drag"
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.contentColumn}>
                            <View style={styles.avatarSection}>
                                <HapticTouchableOpacity
                                    accessibilityLabel={t('profileAtelier.edit.avatarAction', 'Edit photo or avatar')}
                                    accessibilityRole="button"
                                    activeOpacity={0.96}
                                    hapticType="selection"
                                    onLongPress={canRevealBuildFingerprint ? handleRevealBuildFingerprint : undefined}
                                    onPress={handleOpenImageActionSheet}
                                    style={styles.portraitButton}
                                    testID="profile-edit-portrait-trigger"
                                >
                                    <View style={[styles.avatarFrame, isDarkTheme ? styles.avatarFrameDark : null]}>
                                        {hasImage ? (
                                            <>
                                                <SecureImage
                                                    source={{ uri: resolvedImage }}
                                                    style={styles.avatarImage}
                                                    fallbackContainerStyle={styles.avatarFallback}
                                                    fallbackColor={homeDashboardColors.inkSoft}
                                                    fallbackIconSize={20}
                                                />
                                                <View pointerEvents="none" style={styles.avatarImageWash} />
                                            </>
                                        ) : (
                                            <View style={[styles.avatarEmpty, isDarkTheme ? styles.avatarEmptyDark : null]}>
                                                <Text
                                                    style={[
                                                        styles.avatarGlyph,
                                                        isDarkTheme ? styles.avatarGlyphDark : null,
                                                    ]}
                                                >
                                                    {getInitialGlyph(state.name)}
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    <View style={[styles.cameraButton, isDarkTheme ? styles.cameraButtonDark : null]}>
                                        <Camera
                                            color="rgba(255, 249, 241, 0.98)"
                                            size={18}
                                            strokeWidth={2.7}
                                        />
                                    </View>

                                    <View
                                        pointerEvents="none"
                                        style={[
                                            styles.avatarActionButton,
                                            isDarkTheme ? styles.avatarActionButtonDark : null,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.avatarActionText,
                                                isDarkTheme ? styles.avatarActionTextDark : null,
                                            ]}
                                        >
                                            {t('profileAtelier.edit.avatarAction', 'Edit photo or avatar')}
                                        </Text>
                                    </View>
                                </HapticTouchableOpacity>
                            </View>

                            <Pressable
                                accessibilityLabel={t('profileAtelier.hero.name', 'Name')}
                                accessibilityRole="button"
                                accessibilityValue={{ text: state.name }}
                                onPress={handleFocusNameInput}
                                style={styles.nameCardButton}
                                testID="profile-edit-name-row"
                            >
                                <View style={[styles.nameCard, isDarkTheme ? styles.nameCardDark : null]}>
                                    <Text style={[styles.nameLabel, isDarkTheme ? styles.nameLabelDark : null]}>
                                        {t('profileAtelier.hero.name', 'Name')}
                                    </Text>
                                    <TextInput
                                        accessibilityLabel={t('profileAtelier.hero.name', 'Name')}
                                        autoCapitalize="words"
                                        autoCorrect={false}
                                        onChangeText={state.setName}
                                        placeholder={t('profileAtelier.hero.namePlaceholder', 'Enter name')}
                                        placeholderTextColor={
                                            isDarkTheme
                                                ? 'rgba(255, 255, 255, 0.42)'
                                                : 'rgba(58, 45, 31, 0.36)'
                                        }
                                        ref={nameInputRef}
                                        returnKeyType="done"
                                        selectionColor={homeDashboardColors.accentBlue}
                                        style={[styles.nameInput, isDarkTheme ? styles.nameInputDark : null]}
                                        testID="profile-edit-name-input"
                                        value={state.name}
                                    />
                                    <ChevronRight
                                        color={isDarkTheme ? 'rgba(255, 255, 255, 0.56)' : 'rgba(58, 45, 31, 0.38)'}
                                        size={18}
                                        strokeWidth={2.2}
                                        style={styles.nameChevron}
                                    />
                                </View>
                            </Pressable>
                        </View>
                    </ScrollView>

                    <ProfileDeveloperSheet
                        closeLabel={t('profileAtelier.developer.close', 'Close')}
                        onClose={() => {
                            setIsBuildFingerprintVisible(false);
                        }}
                        rows={buildFingerprintRows}
                        title={t('profileAtelier.developer.title', 'Developer Info')}
                        visible={canRevealBuildFingerprint && isBuildFingerprintVisible}
                    />

                    <Modal
                        animationType="fade"
                        hardwareAccelerated
                        onRequestClose={handleCloseImageActionSheet}
                        statusBarTranslucent
                        transparent
                        visible={isImageActionSheetVisible}
                    >
                        <View style={styles.actionSheetOverlay}>
                            <Pressable onPress={handleCloseImageActionSheet} style={styles.actionSheetDismissArea} />

                            <SafeAreaView edges={['bottom']} style={styles.actionSheetSafeArea}>
                                <View
                                    style={[
                                        styles.actionSheetContainer,
                                        isDarkTheme ? styles.actionSheetContainerDark : null,
                                    ]}
                                >
                                    {isDarkTheme ? null : (
                                        <ProfilePearlSurfaceOverlay
                                            accentWashColor={homeDashboardColors.pearlMist}
                                            baseBottomColor={homeDashboardColors.paperStrong}
                                            baseTopColor={homeDashboardColors.pearlIvory}
                                            coolWashColor={homeDashboardColors.pearlGlow}
                                            warmWashColor={homeDashboardColors.pearlPeach}
                                        />
                                    )}

                                    <View style={styles.actionSheetContent}>
                                        <View style={styles.actionSheetHandle} />

                                        <View style={styles.actionSheetHeader}>
                                            <Text
                                                style={[
                                                    styles.actionSheetTitle,
                                                    isDarkTheme ? styles.actionSheetTitleDark : null,
                                                ]}
                                            >
                                                {t('profileAtelier.edit.avatarAction', 'Edit photo or avatar')}
                                            </Text>

                                            <HapticTouchableOpacity
                                                accessibilityLabel={t('common.cancel', 'Cancel')}
                                                accessibilityRole="button"
                                                activeOpacity={0.9}
                                                hapticType="light"
                                                onPress={handleCloseImageActionSheet}
                                                style={[
                                                    styles.actionSheetCloseButton,
                                                    isDarkTheme ? styles.actionSheetCloseButtonDark : null,
                                                ]}
                                            >
                                                <X
                                                    color={
                                                        isDarkTheme
                                                            ? 'rgba(255, 255, 255, 0.72)'
                                                            : homeDashboardColors.inkSoft
                                                    }
                                                    size={16}
                                                />
                                            </HapticTouchableOpacity>
                                        </View>

                                        <View style={styles.actionSheetList}>
                                            <HapticTouchableOpacity
                                                accessibilityLabel={t('profileAtelier.hero.action.camera', 'Camera')}
                                                accessibilityRole="button"
                                                activeOpacity={0.9}
                                                hapticType="selection"
                                                onPress={handleOpenCamera}
                                                style={[
                                                    styles.actionSheetAction,
                                                    isDarkTheme ? styles.actionSheetActionDark : null,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.actionSheetActionText,
                                                        isDarkTheme ? styles.actionSheetActionTextDark : null,
                                                    ]}
                                                >
                                                    {t('profileAtelier.hero.action.camera', 'Camera')}
                                                </Text>
                                            </HapticTouchableOpacity>

                                            <HapticTouchableOpacity
                                                accessibilityLabel={t('profileAtelier.hero.action.library', 'Photos')}
                                                accessibilityRole="button"
                                                activeOpacity={0.9}
                                                hapticType="selection"
                                                onPress={handleOpenLibrary}
                                                style={[
                                                    styles.actionSheetAction,
                                                    isDarkTheme ? styles.actionSheetActionDark : null,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.actionSheetActionText,
                                                        isDarkTheme ? styles.actionSheetActionTextDark : null,
                                                    ]}
                                                >
                                                    {t('profileAtelier.hero.action.library', 'Photos')}
                                                </Text>
                                            </HapticTouchableOpacity>
                                        </View>
                                    </View>
                                </View>
                            </SafeAreaView>
                        </View>
                    </Modal>
                </View>
            </View>
        </TopLevelScreenShell>
    );
}
