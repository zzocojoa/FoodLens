import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import {
    allergiesDashboardStyles as styles,
} from './allergiesDashboardStyles';

export type AllergiesEmptyHeroProps = {
    eyebrow: string;
    title: string;
    description: string;
    actionLabel: string;
    onActionPress: () => void;
    secondaryLabel?: string;
    onSecondaryPress?: () => void;
};

export default function AllergiesEmptyHero({
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
        <View style={styles.elevatedCard}>
            <View style={styles.heroCopy}>
                <View style={styles.emptyBadge}>
                    <Text style={styles.emptyBadgeText}>{eyebrow}</Text>
                </View>
                <Text style={styles.emptyTitle}>{title}</Text>
                <Text style={styles.emptyDescription}>{description}</Text>
            </View>

            <View style={styles.emptyActionRow}>
                <TouchableOpacity
                    accessibilityRole="button"
                    onPress={onActionPress}
                    activeOpacity={0.86}
                    style={styles.primaryActionButton}
                >
                    <Text style={styles.primaryActionButtonText}>{actionLabel}</Text>
                </TouchableOpacity>

                {secondaryActionLabel !== null && secondaryActionPress !== null ? (
                    <TouchableOpacity
                        accessibilityRole="button"
                        onPress={secondaryActionPress}
                        activeOpacity={0.86}
                        style={styles.secondaryActionButton}
                    >
                        <Text style={styles.secondaryActionButtonText}>{secondaryActionLabel}</Text>
                    </TouchableOpacity>
                ) : null}
            </View>
        </View>
    );
}
