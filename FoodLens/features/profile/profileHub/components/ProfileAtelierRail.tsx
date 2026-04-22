import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import PearlSurfaceOverlay from '@/features/home/components/PearlSurfaceOverlay';
import { homeDashboardStyles } from '@/features/home/components/homeDashboardStyles';
import {
    homeDashboardColors,
    homeDashboardRadii,
    homeDashboardSpacing,
    homeDashboardTypography,
} from '@/features/home/components/homeDashboardTokens';
import { useI18n } from '@/features/i18n';

type ProfileAtelierRailProps = {
    name: string;
    image?: string;
};

const getFallbackGlyph = (name: string): string => {
    const trimmedName = name.trim();

    if (!trimmedName) {
        return 'A';
    }

    return trimmedName[0]?.toUpperCase() ?? 'A';
};

export default function ProfileAtelierRail({
    name,
    image,
}: ProfileAtelierRailProps): React.JSX.Element {
    const { t } = useI18n();
    const displayName = name.trim() || 'Traveler';
    const hasImage = typeof image === 'string' && image.trim().length > 0;

    return (
        <View style={[homeDashboardStyles.sectionCard, styles.container]}>
            <PearlSurfaceOverlay
                accentWashColor={homeDashboardColors.pearlMist}
                baseBottomColor="#FFF8F0"
                baseTopColor={homeDashboardColors.pearlIvory}
                coolWashColor={homeDashboardColors.pearlSage}
                warmWashColor={homeDashboardColors.pearlPeach}
            />

            <View style={styles.identityRow}>
                <View style={styles.avatarFrame}>
                    {hasImage ? (
                        <Image source={{ uri: image }} style={styles.avatarImage} />
                    ) : (
                        <View style={styles.avatarFallbackSurface}>
                            <Text style={styles.avatarFallbackLabel}>{getFallbackGlyph(displayName)}</Text>
                        </View>
                    )}
                </View>

                <View style={styles.copyBlock}>
                    <Text numberOfLines={1} style={styles.railTitle}>
                        {t('profileAtelier.rail.title', 'Traveler Atelier')}
                    </Text>
                    <Text numberOfLines={1} style={styles.displayName}>
                        {displayName}
                    </Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
        paddingHorizontal: homeDashboardSpacing.md,
        paddingVertical: homeDashboardSpacing.sm,
        position: 'relative',
    },
    identityRow: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: homeDashboardSpacing.sm,
        zIndex: 1,
    },
    avatarFrame: {
        alignItems: 'center',
        backgroundColor: homeDashboardColors.paperStrong,
        borderColor: homeDashboardColors.lineStrong,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.md,
        borderWidth: 1,
        height: 54,
        justifyContent: 'center',
        overflow: 'hidden',
        width: 54,
    },
    avatarImage: {
        height: '100%',
        width: '100%',
    },
    avatarFallbackSurface: {
        alignItems: 'center',
        backgroundColor: homeDashboardColors.paperStrong,
        flex: 1,
        justifyContent: 'center',
        width: '100%',
    },
    avatarFallbackLabel: {
        color: homeDashboardColors.accentBlue,
        fontSize: homeDashboardTypography.bodyStrong,
        fontWeight: '700',
        lineHeight: 18,
    },
    copyBlock: {
        flex: 1,
        gap: homeDashboardSpacing.xxs,
        minWidth: 0,
    },
    railTitle: {
        color: homeDashboardColors.inkSoft,
        fontSize: homeDashboardTypography.caption,
        fontWeight: '700',
        letterSpacing: 0.7,
        lineHeight: 16,
        textTransform: 'uppercase',
    },
    displayName: {
        color: homeDashboardColors.ink,
        fontSize: 19,
        fontWeight: '700',
        letterSpacing: -0.4,
        lineHeight: 22,
    },
});
