import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { resultContentStyles as styles } from '../styles';
import { ResultTheme } from '../types';

type ResultTimestampRowProps = {
  formattedTimestamp: string;
  theme: ResultTheme;
  onDatePress?: () => void;
};

export default function ResultTimestampRow({
  formattedTimestamp,
  theme,
  onDatePress,
}: ResultTimestampRowProps) {
  return (
    <TouchableOpacity onPress={onDatePress} activeOpacity={0.7}>
      <View style={styles.locationRow}>
        <Calendar size={14} color={theme.textSecondary} />
        <Text style={[styles.locationText, { color: theme.textSecondary }]}>{formattedTimestamp}</Text>
      </View>
    </TouchableOpacity>
  );
}
