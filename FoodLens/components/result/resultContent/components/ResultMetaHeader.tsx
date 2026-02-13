import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { MapPin, ShieldCheck, Sparkles } from 'lucide-react-native';
import { resultContentStyles as styles } from '../styles';
import { ResultTheme } from '../types';
import { useResultMetaHeaderModel } from '../hooks/useResultMetaHeaderModel';
import ResultTimestampRow from './ResultTimestampRow';

type ResultMetaHeaderProps = {
    foodName: string;
    confidence?: number;
    locationText: string;
    formattedTimestamp: string | null;
    theme: ResultTheme;
    onOpenBreakdown: () => void;
    onDatePress?: () => void;
};

export default function ResultMetaHeader({
    foodName,
    confidence,
    locationText,
    formattedTimestamp,
    theme,
    onOpenBreakdown,
    onDatePress,
}: ResultMetaHeaderProps) {
    const { confidenceLabel } = useResultMetaHeaderModel(confidence);

    return (
        <View style={styles.headerSection}>
            <View style={styles.subHeaderRow}>
                <MapPin size={12} color="#60A5FA" />
                <Text style={[styles.subHeaderText, { color: theme.textSecondary }]}>VISUAL RECOGNITION</Text>
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
                />
            )}

            <View style={styles.statsRow}>
                <View style={[styles.statBadge, { backgroundColor: '#ECFDF5', borderColor: '#D1FAE5' }]}>
                    <ShieldCheck size={14} color="#059669" />
                    <Text style={[styles.statText, { color: '#047857' }]}>{confidenceLabel}</Text>
                </View>
                <TouchableOpacity
                    onPress={onOpenBreakdown}
                    style={[styles.statBadge, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}
                >
                    <Sparkles size={14} color="#4F46E5" />
                    <Text style={[styles.statText, { color: '#4F46E5' }]}>BREAKDOWN</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}
