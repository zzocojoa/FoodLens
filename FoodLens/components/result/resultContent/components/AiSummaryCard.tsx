import React from 'react';
import { Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { resultContentStyles as styles } from '../styles';
import { ResultTheme } from '../types';
import { getAiSummaryCardColors, resolveAiSummaryText } from '../utils/cardPresentation';

type AiSummaryCardProps = {
    colorScheme: 'light' | 'dark';
    theme: ResultTheme;
    summary?: string;
};

export default function AiSummaryCard({ colorScheme, theme, summary }: AiSummaryCardProps) {
    const colors = getAiSummaryCardColors(colorScheme, theme);

    return (
        <View
            style={[
                styles.aiSummaryCard,
                colors,
            ]}
        >
            <View style={styles.aiGlow} />
            <View style={styles.aiHeader}>
                <Sparkles size={18} color="#60A5FA" fill="#60A5FA" />
                <Text style={styles.aiTitle}>AI Health Coach</Text>
            </View>
            <Text style={[styles.aiText, { color: theme.textPrimary }]}>
                {resolveAiSummaryText(summary)}
            </Text>
        </View>
    );
}
