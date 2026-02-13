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

export default function AiSummaryCard({ colorScheme, theme, summary, locale, t }: AiSummaryCardProps) {
    const isKoreanLocale = (locale || '').toLowerCase().startsWith('ko');
    const titleFallback = isKoreanLocale ? 'AI 건강 코치' : 'AI Health Coach';
    const summaryFallback = isKoreanLocale
        ? '이 음식은 전반적으로 균형 있어 보입니다. 숨은 알레르기 성분이 없다면 보통 식단에 무난합니다.'
        : 'This food appears balanced. Assuming no hidden allergens, it fits well within a moderate diet.';

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
