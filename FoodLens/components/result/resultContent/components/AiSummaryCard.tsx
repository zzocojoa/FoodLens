import React from 'react';
import { Text, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
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
    const titleFallback = 'Why this result';
    const summaryFallback =
        'Review the detected ingredients and context below before you decide whether this is safe to eat.';

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
            <View style={styles.aiHeader}>
                <ShieldCheck size={18} color="#0F766E" />
                <Text style={styles.aiTitle}>{t('result.ai.title', titleFallback)}</Text>
            </View>
            <Text style={[styles.aiText, { color: theme.textPrimary }]}>
                {summaryText}
            </Text>
        </View>
    );
}
