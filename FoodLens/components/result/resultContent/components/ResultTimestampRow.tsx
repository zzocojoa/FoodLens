import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { resultContentStyles as styles } from '../styles';
import { ResultTheme } from '../types';

type ResultTimestampRowProps = {
  formattedTimestamp: string;
  theme: ResultTheme;
  onDatePress?: () => void;
  t: (key: string, fallback?: string) => string;
};

export default function ResultTimestampRow({
  formattedTimestamp,
  theme,
  onDatePress,
  t,
}: ResultTimestampRowProps) {
  return (
    <TouchableOpacity onPress={onDatePress} activeOpacity={0.7}>
      <View style={styles.locationRow}>
        <Calendar size={12} color={theme.textSecondary} />
        <Text style={[styles.locationText, { color: theme.textSecondary }]}>{formattedTimestamp}</Text>
        <View
          style={{
            marginLeft: 6,
            backgroundColor: '#F1F5F9',
            borderRadius: 4,
            paddingHorizontal: 4,
            paddingVertical: 2,
          }}
        >
          <Text style={{ fontSize: 9, color: '#64748B', fontWeight: 'bold' }}>
            {t('result.meta.edit', 'EDIT')}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
