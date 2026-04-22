import React from 'react';
import {
    Keyboard,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { Camera, Image as ImageIcon, LayoutGrid, X } from 'lucide-react-native';

import { HapticPressable, HapticTouchableOpacity } from '@/components/HapticFeedback';
import { SecureImage } from '@/components/SecureImage';
import type { ColorSchemeName } from '@/constants/theme';
import ProfilePearlSurfaceOverlay from '@/features/home/components/PearlSurfaceOverlay';
import { homeDashboardStyles } from '@/features/home/components/homeDashboardStyles';
import {
    homeDashboardColors,
    homeDashboardRadii,
    homeDashboardSpacing,
    homeDashboardTypography,
} from '@/features/home/components/homeDashboardTokens';
import { useI18n } from '@/features/i18n';
import { resolveImageUri } from '@/services/imageStorage';

import ProfileAvatarPresetSheet from './ProfileAvatarPresetSheet';

type ProfileIdentitySectionProps = {
    colorScheme: ColorSchemeName;
    name: string;
    image?: string;
    avatars: string[];
    onChangeName: (value: string) => void;
    onClearName: () => void;
    onPickCamera: () => void;
    onPickLibrary: () => void;
    onSelectPreset: (url: string) => void;
    onPressSave?: () => void;
    isSaving?: boolean;
    avatarPresetSheetVisible?: boolean;
    onOpenAvatarPresetSheet?: () => void;
    onCloseAvatarPresetSheet?: () => void;
    onLongPressPortrait?: () => void;
    canRevealDeveloperSheet?: boolean;
};

type AtelierActionChipProps = {
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    tone: string;
    isDarkTheme: boolean;
};

const ACTION_ICON_SIZE = 15;

const getInitialGlyph = (name: string): string => {
    const trimmedName = name.trim();

    if (!trimmedName) {
        return 'A';
    }

    return trimmedName[0]?.toUpperCase() ?? 'A';
};

const AtelierActionChip = ({
    icon,
    label,
    onPress,
    tone,
    isDarkTheme,
}: AtelierActionChipProps): React.JSX.Element => {
    return (
        <HapticTouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.9}
            hapticType="light"
            onPress={onPress}
            style={[styles.actionChip, isDarkTheme ? styles.actionChipDark : null]}
        >
            <View style={[styles.actionIconWrap, { backgroundColor: tone }]}>{icon}</View>
            <Text numberOfLines={1} style={[styles.actionLabel, isDarkTheme ? styles.actionLabelDark : null]}>
                {label}
            </Text>
        </HapticTouchableOpacity>
    );
};

export default function ProfileIdentitySection(props: ProfileIdentitySectionProps): React.JSX.Element {
    const {
        colorScheme,
        name,
        image,
        avatars,
        onChangeName,
        onClearName,
        onPickCamera,
        onPickLibrary,
        onSelectPreset,
        onPressSave,
        isSaving,
        avatarPresetSheetVisible,
        onOpenAvatarPresetSheet,
        onCloseAvatarPresetSheet,
        onLongPressPortrait,
        canRevealDeveloperSheet,
    } = props;
    const { t } = useI18n();
    const [isAvatarPresetSheetOpen, setIsAvatarPresetSheetOpen] = React.useState<boolean>(false);
    const isAvatarPresetSheetControlled = typeof avatarPresetSheetVisible === 'boolean';
    const isAvatarSheetVisible = isAvatarPresetSheetControlled ? avatarPresetSheetVisible : isAvatarPresetSheetOpen;
    const resolvedImage = React.useMemo(() => {
        if (typeof image !== 'string') {
            return undefined;
        }

        const trimmedImage = image.trim();
        if (!trimmedImage) {
            return undefined;
        }

        return resolveImageUri(trimmedImage) ?? trimmedImage;
    }, [image]);
    const hasImage = typeof resolvedImage === 'string' && resolvedImage.length > 0;
    const canUseDeveloperLongPress = canRevealDeveloperSheet === true && typeof onLongPressPortrait === 'function';
    const isDarkTheme = colorScheme === 'dark';
    const namePlatePlaceholderColor =
        isDarkTheme ? 'rgba(255, 255, 255, 0.38)' : 'rgba(23, 32, 51, 0.34)';
    void onPressSave;
    void isSaving;

    const handleOpenAvatarPresetSheet = React.useCallback(() => {
        Keyboard.dismiss();

        if (!isAvatarPresetSheetControlled) {
            setIsAvatarPresetSheetOpen(true);
        }

        onOpenAvatarPresetSheet?.();
    }, [isAvatarPresetSheetControlled, onOpenAvatarPresetSheet]);

    const handleCloseAvatarPresetSheet = React.useCallback(() => {
        if (!isAvatarPresetSheetControlled) {
            setIsAvatarPresetSheetOpen(false);
        }

        onCloseAvatarPresetSheet?.();
    }, [isAvatarPresetSheetControlled, onCloseAvatarPresetSheet]);

    const handleSelectPreset = React.useCallback(
        (url: string) => {
            onSelectPreset(url);
            handleCloseAvatarPresetSheet();
        },
        [handleCloseAvatarPresetSheet, onSelectPreset],
    );

    const portraitStage = (
        <View style={[styles.portraitHalo, isDarkTheme ? styles.portraitHaloDark : null]}>
            <View style={[styles.portraitFrame, isDarkTheme ? styles.portraitFrameDark : null]}>
                {hasImage ? (
                    <SecureImage
                        source={{ uri: resolvedImage }}
                        style={styles.portraitImage}
                        fallbackColor={homeDashboardColors.inkSoft}
                        fallbackIconSize={24}
                    />
                ) : (
                    <View style={[styles.emptyPortrait, isDarkTheme ? styles.emptyPortraitDark : null]}>
                        <View style={styles.emptyPortraitWash} />
                        <Text style={[styles.emptyPortraitGlyph, isDarkTheme ? styles.emptyPortraitGlyphDark : null]}>
                            {getInitialGlyph(name)}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );

    return (
        <>
            <View
                style={[
                    homeDashboardStyles.elevatedCard,
                    styles.identityCard,
                    isDarkTheme ? styles.identityCardDark : null,
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

                {isDarkTheme ? null : <View pointerEvents="none" style={styles.cardGlow} />}

                <View style={styles.cardContent}>
                    <View style={styles.identityRow}>
                        <View style={styles.portraitStage}>
                            {canUseDeveloperLongPress ? (
                                <HapticTouchableOpacity
                                    activeOpacity={1}
                                    hapticType="selection"
                                    onLongPress={onLongPressPortrait}
                                    style={styles.longPressSurface}
                                >
                                    {portraitStage}
                                </HapticTouchableOpacity>
                            ) : (
                                portraitStage
                            )}
                        </View>

                        <View style={styles.identityCopy}>
                            <View style={[styles.namePlate, isDarkTheme ? styles.namePlateDark : null]}>
                                <TextInput
                                    accessibilityLabel={t('profileAtelier.hero.name', 'Name')}
                                    onChangeText={onChangeName}
                                    placeholder={t('profileAtelier.hero.namePlaceholder', 'Enter name')}
                                    placeholderTextColor={namePlatePlaceholderColor}
                                    selectionColor={homeDashboardColors.accentBlue}
                                    style={[styles.nameInput, isDarkTheme ? styles.nameInputDark : null]}
                                    value={name}
                                />

                                {name.trim().length > 0 ? (
                                    <HapticPressable
                                        accessibilityLabel={t(
                                            'profileHub.identity.clearDisplayName',
                                            'Clear display name',
                                        )}
                                        accessibilityRole="button"
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        hapticType="selection"
                                        onPress={() => {
                                            Keyboard.dismiss();
                                            requestAnimationFrame(() => {
                                                onClearName();
                                            });
                                        }}
                                        style={[styles.clearButton, isDarkTheme ? styles.clearButtonDark : null]}
                                    >
                                        <X
                                            color={
                                                isDarkTheme
                                                    ? 'rgba(255, 255, 255, 0.72)'
                                                    : homeDashboardColors.inkSoft
                                            }
                                            size={15}
                                        />
                                    </HapticPressable>
                                ) : null}
                            </View>
                        </View>
                    </View>

                    <ScrollView
                        contentContainerStyle={styles.actionDock}
                        horizontal
                        keyboardShouldPersistTaps="handled"
                        showsHorizontalScrollIndicator={false}
                    >
                        <AtelierActionChip
                            icon={<Camera color={homeDashboardColors.accentBlue} size={ACTION_ICON_SIZE} />}
                            isDarkTheme={isDarkTheme}
                            label={t('profileAtelier.hero.action.camera', 'Camera')}
                            onPress={onPickCamera}
                            tone="rgba(36, 56, 93, 0.12)"
                        />
                        <AtelierActionChip
                            icon={<ImageIcon color={homeDashboardColors.accentGreen} size={ACTION_ICON_SIZE} />}
                            isDarkTheme={isDarkTheme}
                            label={t('profileAtelier.hero.action.library', 'Library')}
                            onPress={onPickLibrary}
                            tone="rgba(31, 107, 79, 0.14)"
                        />
                        <AtelierActionChip
                            icon={<LayoutGrid color={homeDashboardColors.accentAmber} size={ACTION_ICON_SIZE} />}
                            isDarkTheme={isDarkTheme}
                            label={t('profileAtelier.hero.action.presets', 'Presets')}
                            onPress={handleOpenAvatarPresetSheet}
                            tone="rgba(170, 106, 19, 0.14)"
                        />
                    </ScrollView>
                </View>
            </View>

            <ProfileAvatarPresetSheet
                avatars={avatars}
                colorScheme={colorScheme}
                onClose={handleCloseAvatarPresetSheet}
                onSelectPreset={handleSelectPreset}
                selectedImage={image}
                visible={Boolean(isAvatarSheetVisible)}
            />
        </>
    );
}

const styles = StyleSheet.create({
    identityCard: {
        overflow: 'hidden',
        padding: 0,
        position: 'relative',
    },
    identityCardDark: {
        backgroundColor: 'rgba(12, 18, 30, 0.94)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
        boxShadow: '0 16px 30px rgba(2, 6, 23, 0.24)',
    },
    cardGlow: {
        backgroundColor: 'rgba(255, 255, 255, 0.48)',
        borderRadius: 120,
        height: 140,
        position: 'absolute',
        right: -42,
        top: -24,
        width: 140,
    },
    cardContent: {
        gap: homeDashboardSpacing.md,
        padding: homeDashboardSpacing.md,
        zIndex: 1,
    },
    identityRow: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: homeDashboardSpacing.md,
    },
    portraitStage: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    longPressSurface: {
        borderRadius: homeDashboardRadii.lg,
    },
    portraitHalo: {
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.38)',
        borderColor: 'rgba(255, 255, 255, 0.72)',
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.lg,
        borderWidth: 1,
        boxShadow: '0 12px 28px rgba(34, 29, 20, 0.08)',
        height: 88,
        justifyContent: 'center',
        width: 88,
    },
    portraitHaloDark: {
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    portraitFrame: {
        backgroundColor: homeDashboardColors.pearlIvory,
        borderColor: homeDashboardColors.line,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.md,
        borderWidth: 1,
        height: 72,
        overflow: 'hidden',
        width: 72,
    },
    portraitFrameDark: {
        backgroundColor: 'rgba(16, 23, 37, 0.92)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    portraitImage: {
        height: '100%',
        width: '100%',
    },
    emptyPortrait: {
        alignItems: 'center',
        backgroundColor: homeDashboardColors.paperMuted,
        flex: 1,
        justifyContent: 'center',
        overflow: 'hidden',
    },
    emptyPortraitDark: {
        backgroundColor: 'rgba(16, 23, 37, 0.92)',
    },
    emptyPortraitWash: {
        backgroundColor: 'rgba(255, 255, 255, 0.44)',
        borderRadius: 40,
        height: 42,
        position: 'absolute',
        right: -4,
        top: -10,
        width: 42,
    },
    emptyPortraitGlyph: {
        color: homeDashboardColors.inkSoft,
        fontSize: 26,
        fontWeight: '700',
        letterSpacing: -0.8,
    },
    emptyPortraitGlyphDark: {
        color: 'rgba(255, 255, 255, 0.86)',
    },
    identityCopy: {
        flex: 1,
    },
    namePlate: {
        alignItems: 'center',
        backgroundColor: 'rgba(255, 252, 247, 0.9)',
        borderColor: homeDashboardColors.line,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.lg,
        borderWidth: 1,
        flexDirection: 'row',
        minHeight: 58,
        paddingHorizontal: homeDashboardSpacing.md,
        paddingVertical: homeDashboardSpacing.xs,
    },
    namePlateDark: {
        backgroundColor: 'rgba(16, 23, 37, 0.88)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    nameInput: {
        color: homeDashboardColors.ink,
        flex: 1,
        fontSize: 23,
        fontWeight: '800',
        letterSpacing: -0.8,
        lineHeight: 28,
        minWidth: 0,
        paddingRight: homeDashboardSpacing.sm,
    },
    nameInputDark: {
        color: homeDashboardColors.pearlIvory,
    },
    clearButton: {
        alignItems: 'center',
        backgroundColor: homeDashboardColors.surfaceMuted,
        borderColor: homeDashboardColors.line,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.pill,
        borderWidth: 1,
        height: 30,
        justifyContent: 'center',
        width: 30,
    },
    clearButtonDark: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    actionDock: {
        flexDirection: 'row',
        gap: homeDashboardSpacing.sm,
        paddingRight: homeDashboardSpacing.xs,
    },
    actionChip: {
        alignItems: 'center',
        backgroundColor: 'rgba(255, 251, 246, 0.92)',
        borderColor: homeDashboardColors.line,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.md,
        borderWidth: 1,
        flexDirection: 'row',
        gap: homeDashboardSpacing.xs,
        justifyContent: 'flex-start',
        minHeight: 40,
        paddingHorizontal: homeDashboardSpacing.sm,
    },
    actionChipDark: {
        backgroundColor: 'rgba(16, 23, 37, 0.84)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    actionIconWrap: {
        alignItems: 'center',
        borderRadius: homeDashboardRadii.pill,
        height: 26,
        justifyContent: 'center',
        width: 26,
    },
    actionLabel: {
        color: homeDashboardColors.ink,
        flexShrink: 1,
        fontSize: homeDashboardTypography.caption,
        fontWeight: '700',
        lineHeight: 14,
    },
    actionLabelDark: {
        color: homeDashboardColors.pearlIvory,
    },
});
