import React from 'react';
import { Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { resultContentStyles as styles } from '../styles';
import { ResultTheme } from '../types';
import { useAiSummaryCardModel } from '../hooks/useAiSummaryCardModel';

type AiSummaryCardProps = {
    colorScheme: 'light' | 'dark';
    theme: ResultTheme;
    summary?: string;
    locale?: string;
    t: (key: string, fallback?: string) => string;
};

export default function AiSummaryCard({ colorScheme, theme, summary, t }: AiSummaryCardProps) {
    const titleFallback = 'AI Health Coach';
    const summaryFallback =
        'This food appears balanced. Assuming no hidden allergens, it fits well within a moderate diet.';

    const { colors, summaryText } = useAiSummaryCardModel(
        colorScheme,
        theme,
        summary,
        t('result.ai.defaultSummary', summaryFallback)
    );

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
                <Text style={styles.aiTitle}>{t('result.ai.title', titleFallback)}</Text>
            </View>
            <Text style={[styles.aiText, { color: theme.textPrimary }]}>
                {summaryText}
            </Text>
        </View>
    );
}
