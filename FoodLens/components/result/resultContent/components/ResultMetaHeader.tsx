import React from 'react';
import { Text, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { resultContentStyles as styles } from '../styles';
import { ResultTheme } from '../types';
import ResultTimestampRow from './ResultTimestampRow';

type ResultMetaHeaderProps = {
    foodName: string;
    locationText: string;
    formattedTimestamp: string | null;
    theme: ResultTheme;
    onDatePress?: () => void;
};

export default function ResultMetaHeader({
    foodName,
    locationText,
    formattedTimestamp,
    theme,
    onDatePress,
}: ResultMetaHeaderProps) {
    return (
        <View style={styles.headerSection}>
            <Text style={[styles.titleText, { color: theme.textPrimary }]}>{foodName}</Text>

            <View style={styles.metaDetails}>
                <View style={styles.locationRow}>
                    <MapPin size={14} color={theme.textSecondary} />
                    <Text style={[styles.locationText, { color: theme.textSecondary }]}>{locationText}</Text>
                </View>

                {formattedTimestamp && (
                    <ResultTimestampRow
                        formattedTimestamp={formattedTimestamp}
                        theme={theme}
                        onDatePress={onDatePress}
                    />
                )}
            </View>
        </View>
    );
}
