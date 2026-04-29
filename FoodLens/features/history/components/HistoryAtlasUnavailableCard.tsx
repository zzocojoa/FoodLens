import React from 'react';
import { StyleSheet, Text } from 'react-native';

import HistorySurfaceCard from './HistorySurfaceCard';
import {
  historyDashboardColors,
  historyDashboardSpacing as spacing,
  historyDashboardTypography as typography,
  type HistoryDashboardColors,
} from './historyDashboardTokens';
import { useI18n } from '@/features/i18n';

type HistoryAtlasUnavailableCardProps = {
  colors: HistoryDashboardColors;
};

export default function HistoryAtlasUnavailableCard({
  colors,
}: HistoryAtlasUnavailableCardProps): React.JSX.Element {
  const { t } = useI18n();

  return (
    <HistorySurfaceCard
      accentWashColor={colors.pearlMist}
      colors={colors}
      contentStyle={styles.content}
      style={styles.card}
      warmWashColor={colors.pearlPeach}
    >
      <Text style={[styles.title, { color: colors.ink }]}>{t('history.atlas.unavailableTitle', '지도 사용 불가')}</Text>
      <Text style={[styles.body, { color: colors.inkSoft }]}>{t('history.atlas.unavailableBody', '이 빌드에서는 지도를 사용할 수 없습니다')}</Text>
    </HistorySurfaceCard>
  );
}

const styles = StyleSheet.create({
  body: {
    color: historyDashboardColors.inkSoft,
    fontSize: typography.body,
    lineHeight: 20,
    textAlign: 'center',
  },
  card: {
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  content: {
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 440,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  title: {
    color: historyDashboardColors.ink,
    fontSize: typography.bodyStrong,
    fontWeight: '800',
    lineHeight: 18,
    textAlign: 'center',
  },
});
