import React from 'react';
import { Text, View } from 'react-native';

import {
    allergiesDashboardStyles as styles,
} from './allergiesDashboardStyles';
import {
    AllergiesDashboardTone,
    getAllergiesDashboardToneTokens,
} from './allergiesDashboardTokens';

export type AllergiesConciergeRailProps = {
    eyebrow?: string;
    title: string;
    description: string;
    statusLabel: string;
    savedCountLabel: string;
    statusTone: AllergiesDashboardTone;
};

export default function AllergiesConciergeRail({
    eyebrow,
    title,
    description,
    statusLabel,
    savedCountLabel,
    statusTone,
}: AllergiesConciergeRailProps) {
    const toneTokens = getAllergiesDashboardToneTokens(statusTone);
    const hasEyebrow = typeof eyebrow === 'string' && eyebrow.trim().length > 0;

    return (
        <View style={styles.sectionCard}>
            <View style={styles.railHeader}>
                {hasEyebrow ? <Text style={styles.railEyebrow}>{eyebrow}</Text> : null}
                <Text style={styles.railTitle}>{title}</Text>
                <Text style={styles.railDescription}>{description}</Text>
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
                <View style={styles.pill}>
                    <Text style={styles.pillText}>{savedCountLabel}</Text>
                </View>
            </View>
        </View>
    );
}
