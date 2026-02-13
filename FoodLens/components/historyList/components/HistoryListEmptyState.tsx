import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { List } from 'lucide-react-native';
import { HistoryTheme } from '@/components/historyList/types';
import { historyListViewStyles as styles } from '@/components/historyList/styles';

type HistoryListEmptyStateProps = {
  loading: boolean;
  theme: HistoryTheme;
};

export default function HistoryListEmptyState({ loading, theme }: HistoryListEmptyStateProps) {
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={theme.textPrimary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Passport...</Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyContainer}>
      <List size={48} color={theme.textSecondary} />
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No records found</Text>
    </View>
  );
}
