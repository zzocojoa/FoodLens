import React from 'react';
import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Trash2 } from 'lucide-react-native';
import { HapticTouchableOpacity } from '../../HapticFeedback';
import { historyListStyles as styles } from '../styles';

type HistoryFloatingDeleteBarProps = {
  selectedCount: number;
  onBulkDelete: () => void;
};

export default function HistoryFloatingDeleteBar({
  selectedCount,
  onBulkDelete,
}: HistoryFloatingDeleteBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <LinearGradient
      colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)', '#FFFFFF']}
      style={styles.floatingBarContainer}
      pointerEvents="box-none"
    >
      <HapticTouchableOpacity
        onPress={onBulkDelete}
        style={styles.floatingDeleteButton}
        activeOpacity={0.9}
        hapticType="warning"
      >
        <View style={styles.floatingDeleteContent}>
          <Trash2 size={24} color="white" />
          <Text style={styles.floatingDeleteText}>Delete ({selectedCount})</Text>
        </View>
      </HapticTouchableOpacity>
    </LinearGradient>
  );
}
