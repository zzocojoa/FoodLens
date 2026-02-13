import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { List } from 'lucide-react-native';
import { HistoryTheme } from '@/components/historyList/types';
import { historyListViewStyles as styles } from '@/components/historyList/styles';
import { useI18n } from '@/features/i18n';

type HistoryListEmptyStateProps = {
  loading: boolean;
  theme: HistoryTheme;
};

export default function HistoryListEmptyState({ loading, theme }: HistoryListEmptyStateProps) {
  const { t } = useI18n();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={theme.textPrimary} />
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
          {t('history.loading.passport', 'Loading Passport...')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyContainer}>
      <List size={48} color={theme.textSecondary} />
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
        {t('history.empty.noRecords', 'No records found')}
      </Text>
    </View>
  );
}
