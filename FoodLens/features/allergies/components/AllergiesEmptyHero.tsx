import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import {
    allergiesDashboardStyles as styles,
} from './allergiesDashboardStyles';
import type { AllergiesDashboardColors } from './allergiesDashboardTokens';

export type AllergiesEmptyHeroProps = {
    colors: AllergiesDashboardColors;
    eyebrow: string;
    title: string;
    description: string;
    actionLabel: string;
    onActionPress: () => void;
    secondaryLabel?: string;
    onSecondaryPress?: () => void;
};

export default function AllergiesEmptyHero({
    colors,
    eyebrow,
    title,
    description,
    actionLabel,
    onActionPress,
    secondaryLabel,
    onSecondaryPress,
}: AllergiesEmptyHeroProps) {
    const secondaryActionLabel =
        secondaryLabel !== undefined && onSecondaryPress !== undefined ? secondaryLabel : null;
    const secondaryActionPress =
        secondaryLabel !== undefined && onSecondaryPress !== undefined ? onSecondaryPress : null;

    return (
        <View style={[styles.elevatedCard, { backgroundColor: colors.surfaceStrong, borderColor: colors.line }]}>
            <View style={styles.heroCopy}>
                <View
                    style={[
                        styles.emptyBadge,
                        { backgroundColor: colors.surfaceMuted, borderColor: colors.line },
                    ]}
                >
                    <Text style={[styles.emptyBadgeText, { color: colors.accentBlue }]}>
                        {eyebrow}
                    </Text>
                </View>
                <Text style={[styles.emptyTitle, { color: colors.ink }]}>{title}</Text>
                <Text style={[styles.emptyDescription, { color: colors.inkSoft }]}>
                    {description}
                </Text>
            </View>

            <View style={styles.emptyActionRow}>
                <TouchableOpacity
                    accessibilityRole="button"
                    onPress={onActionPress}
                    activeOpacity={0.86}
                    style={[
                        styles.primaryActionButton,
                        { backgroundColor: colors.ink, borderColor: colors.ink },
                    ]}
                >
                    <Text style={[styles.primaryActionButtonText, { color: colors.paper }]}>
                        {actionLabel}
                    </Text>
                </TouchableOpacity>

                {secondaryActionLabel !== null && secondaryActionPress !== null ? (
                    <TouchableOpacity
                        accessibilityRole="button"
                        onPress={secondaryActionPress}
                        activeOpacity={0.86}
                        style={[
                            styles.secondaryActionButton,
                            { backgroundColor: colors.surfaceMuted, borderColor: colors.lineStrong },
                        ]}
                    >
                        <Text style={[styles.secondaryActionButtonText, { color: colors.ink }]}>
                            {secondaryActionLabel}
                        </Text>
                    </TouchableOpacity>
                ) : null}
            </View>
        </View>
    );
}
