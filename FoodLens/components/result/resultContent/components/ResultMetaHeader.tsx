import React from 'react';
import { Text, View } from 'react-native';
import { MapPin, Sparkles } from 'lucide-react-native';
import { resultContentStyles as styles } from '../styles';
import { ResultTheme } from '../types';
import ResultTimestampRow from './ResultTimestampRow';

type ResultMetaHeaderProps = {
    foodName: string;
    locationText: string;
    formattedTimestamp: string | null;
    theme: ResultTheme;
    onDatePress?: () => void;
    t: (key: string, fallback?: string) => string;
};

export default function ResultMetaHeader({
    foodName,
    locationText,
    formattedTimestamp,
    theme,
    onDatePress,
    t,
}: ResultMetaHeaderProps) {
    return (
        <View style={styles.headerSection}>
            <View style={styles.subHeaderRow}>
                <Sparkles size={12} color="#60A5FA" />
                <Text style={[styles.subHeaderText, { color: theme.textSecondary }]}>
                    {t('result.meta.analyzedFood', 'Recognized item')}
                </Text>
            </View>
            <Text style={[styles.titleText, { color: theme.textPrimary }]}>{foodName}</Text>

            <View style={styles.locationRow}>
                <MapPin size={12} color={theme.textSecondary} />
                <Text style={[styles.locationText, { color: theme.textSecondary }]}>{locationText}</Text>
            </View>

            {formattedTimestamp && (
                <ResultTimestampRow
                    formattedTimestamp={formattedTimestamp}
                    theme={theme}
                    onDatePress={onDatePress}
                    t={t}
                />
            )}
        </View>
    );
}
