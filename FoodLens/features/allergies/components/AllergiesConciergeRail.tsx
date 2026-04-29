import React from 'react';
import { Text, View } from 'react-native';

import {
    allergiesDashboardStyles as styles,
} from './allergiesDashboardStyles';
import {
    AllergiesDashboardTone,
    getAllergiesDashboardToneTokens,
    type AllergiesDashboardColors,
} from './allergiesDashboardTokens';

export type AllergiesConciergeRailProps = {
    colors: AllergiesDashboardColors;
    eyebrow?: string;
    title: string;
    description: string;
    statusLabel: string;
    savedCountLabel: string;
    statusTone: AllergiesDashboardTone;
};

export default function AllergiesConciergeRail({
    colors,
    eyebrow,
    title,
    description,
    statusLabel,
    savedCountLabel,
    statusTone,
}: AllergiesConciergeRailProps) {
    const toneTokens = getAllergiesDashboardToneTokens(colors, statusTone);
    const hasEyebrow = typeof eyebrow === 'string' && eyebrow.trim().length > 0;

    return (
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <View style={styles.railHeader}>
                {hasEyebrow ? (
                    <Text style={[styles.railEyebrow, { color: colors.inkSoft }]}>{eyebrow}</Text>
                ) : null}
                <Text style={[styles.railTitle, { color: colors.ink }]}>{title}</Text>
                <Text style={[styles.railDescription, { color: colors.inkSoft }]}>
                    {description}
                </Text>
            </View>

            <View style={styles.railMetaRow}>
                <View
                    style={[
                        styles.pill,
                        {
                            backgroundColor: toneTokens.backgroundColor,
                            borderColor: toneTokens.borderColor,
                        },
                    ]}
                >
                    <Text style={[styles.pillText, { color: toneTokens.textColor }]}>{statusLabel}</Text>
                </View>
                <View
                    style={[
                        styles.pill,
                        { backgroundColor: colors.surfaceMuted, borderColor: colors.line },
                    ]}
                >
                    <Text style={[styles.pillText, { color: colors.inkSoft }]}>
                        {savedCountLabel}
                    </Text>
                </View>
            </View>
        </View>
    );
}
