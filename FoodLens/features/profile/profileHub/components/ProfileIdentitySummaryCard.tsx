import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChevronDown, Plus } from 'lucide-react-native';

import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import { SecureImage } from '@/components/SecureImage';
import type { ColorSchemeName } from '@/constants/theme';
import {
    homeDashboardColors,
    homeDashboardRadii,
} from '@/features/home/components/homeDashboardTokens';
import { useI18n } from '@/features/i18n';
import { resolveImageUri } from '@/services/imageStorage';

type ProfileIdentitySummaryCardProps = {
    colorScheme: ColorSchemeName;
    name: string;
    image?: string;
    onPressEdit: () => void;
    onLongPressPortrait?: () => void;
};

const getInitialGlyph = (name: string): string => {
    const trimmedName = name.trim();

    if (!trimmedName) {
        return 'A';
    }

    return trimmedName[0]?.toUpperCase() ?? 'A';
};

export default function ProfileIdentitySummaryCard({
    colorScheme,
    name,
    image,
    onPressEdit,
    onLongPressPortrait,
}: ProfileIdentitySummaryCardProps): React.JSX.Element {
    const { t } = useI18n();
    const isDarkTheme = colorScheme === 'dark';
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
    const resolvedName = name.trim().length > 0 ? name.trim() : t('profileAtelier.hero.namePlaceholder', 'Enter name');
    const chevronColor = isDarkTheme ? homeDashboardColors.pearlIvory : homeDashboardColors.ink;
    const plusButtonBorderColor = isDarkTheme ? homeDashboardColors.ink : homeDashboardColors.paper;
    const canUseLongPress = typeof onLongPressPortrait === 'function';

    const avatarStage = (
        <View style={[styles.avatarFrame, isDarkTheme ? styles.avatarFrameDark : null]}>
            {hasImage ? (
                <SecureImage
                    source={{ uri: resolvedImage }}
                    style={styles.avatarImage}
                    fallbackContainerStyle={styles.avatarFallbackSurface}
                    fallbackColor={homeDashboardColors.inkSoft}
                    fallbackIconSize={18}
                />
            ) : (
                <View style={[styles.emptyAvatar, isDarkTheme ? styles.emptyAvatarDark : null]}>
                    <Text style={[styles.emptyAvatarGlyph, isDarkTheme ? styles.emptyAvatarGlyphDark : null]}>
                        {getInitialGlyph(name)}
                    </Text>
                </View>
            )}
        </View>
    );

    return (
        <View style={styles.container} testID="profile-identity-summary-card">
            <View style={styles.avatarCluster}>
                {canUseLongPress ? (
                    <HapticTouchableOpacity
                        activeOpacity={1}
                        hapticType="selection"
                        onLongPress={onLongPressPortrait}
                        style={styles.avatarButton}
                        testID="profile-portrait-trigger"
                    >
                        {avatarStage}
                    </HapticTouchableOpacity>
                ) : (
                    <View style={styles.avatarButton} testID="profile-portrait-trigger">
                        {avatarStage}
                    </View>
                )}

                <HapticTouchableOpacity
                    accessibilityLabel={t('profileAtelier.summary.action.edit', 'Edit')}
                    accessibilityRole="button"
                    activeOpacity={0.9}
                    hapticType="selection"
                    onPress={onPressEdit}
                    style={[styles.plusButton, { borderColor: plusButtonBorderColor }]}
                    testID="profile-edit-action"
                >
                    <Plus color={homeDashboardColors.white} size={28} strokeWidth={2.8} />
                </HapticTouchableOpacity>
            </View>

            <View style={styles.metaRow}>
                <View style={styles.nameCluster}>
                    <Text numberOfLines={1} style={[styles.name, isDarkTheme ? styles.nameDark : null]}>
                        {resolvedName}
                    </Text>
                    <ChevronDown color={chevronColor} size={22} strokeWidth={2.6} />
                    <View style={styles.statusDot} />
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        gap: 10,
        paddingBottom: 4,
        paddingTop: 0,
    },
    avatarCluster: {
        alignItems: 'center',
        height: 136,
        justifyContent: 'center',
        position: 'relative',
        width: 136,
    },
    avatarButton: {
        borderRadius: homeDashboardRadii.pill,
    },
    avatarFrame: {
        alignItems: 'center',
        backgroundColor: homeDashboardColors.paperStrong,
        borderRadius: homeDashboardRadii.pill,
        height: 110,
        justifyContent: 'center',
        overflow: 'hidden',
        width: 110,
    },
    avatarFrameDark: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    avatarImage: {
        height: '100%',
        width: '100%',
    },
    avatarFallbackSurface: {
        alignItems: 'center',
        backgroundColor: homeDashboardColors.paperMuted,
        justifyContent: 'center',
    },
    emptyAvatar: {
        alignItems: 'center',
        backgroundColor: homeDashboardColors.paperMuted,
        borderRadius: homeDashboardRadii.pill,
        justifyContent: 'center',
        height: 110,
        width: 110,
    },
    emptyAvatarDark: {
        backgroundColor: 'rgba(16, 23, 37, 0.92)',
    },
    emptyAvatarGlyph: {
        color: homeDashboardColors.inkSoft,
        fontSize: 32,
        fontWeight: '700',
        letterSpacing: -0.8,
    },
    emptyAvatarGlyphDark: {
        color: 'rgba(255, 255, 255, 0.88)',
    },
    plusButton: {
        alignItems: 'center',
        backgroundColor: '#1FC8F2',
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.pill,
        borderWidth: 5,
        bottom: 14,
        boxShadow: '0 10px 20px rgba(31, 200, 242, 0.18)',
        height: 36,
        justifyContent: 'center',
        position: 'absolute',
        right: 4,
        width: 36,
    },
    metaRow: {
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
    },
    nameCluster: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 1,
        position: 'relative',
    },
    name: {
        color: homeDashboardColors.ink,
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: -0.5,
        lineHeight: 22,
        maxWidth: 160,
        textAlign: 'center',
    },
    nameDark: {
        color: homeDashboardColors.pearlIvory,
    },
    statusDot: {
        alignItems: 'center',
        backgroundColor: '#F62C6B',
        borderColor: homeDashboardColors.paperMuted,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.pill,
        justifyContent: 'center',
        height: 12,
        position: 'absolute',
        right: -8,
        top: -2,
        width: 12,
    },
});
