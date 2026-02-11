import React from 'react';
import { Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { resultContentStyles as styles } from '../styles';
import { ResultTheme } from '../types';

type AiSummaryCardProps = {
    colorScheme: 'light' | 'dark';
    theme: ResultTheme;
    summary?: string;
};

export default function AiSummaryCard({ colorScheme, theme, summary }: AiSummaryCardProps) {
    return (
        <View
            style={[
                styles.aiSummaryCard,
                {
                    backgroundColor: colorScheme === 'dark' ? theme.surface : '#F0F9FF',
                    borderColor: colorScheme === 'dark' ? theme.border : '#E0F2FE',
                },
            ]}
        >
            <View style={styles.aiGlow} />
            <View style={styles.aiHeader}>
                <Sparkles size={18} color="#60A5FA" fill="#60A5FA" />
                <Text style={styles.aiTitle}>AI Health Coach</Text>
            </View>
            <Text style={[styles.aiText, { color: theme.textPrimary }]}>
                {summary ||
                    'This food appears balanced. Assuming no hidden allergens, it fits well within a moderate diet.'}
            </Text>
        </View>
    );
}
