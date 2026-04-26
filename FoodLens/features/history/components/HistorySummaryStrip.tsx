import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/features/i18n';

import type { HistoryJournalSummary } from '../types/historyViewModel.types';
import HistorySurfaceCard from './HistorySurfaceCard';
import {
  historyDashboardColors as colors,
  historyDashboardRadii as radii,
  historyDashboardSpacing as spacing,
  historyDashboardToneTokens,
  historyDashboardTypography as typography,
} from './historyDashboardTokens';

type HistorySummaryStripProps = {
  summary: HistoryJournalSummary;
};

type HistorySummaryMetricProps = {
  label: string;
  value: string;
};

function HistorySummaryMetric({
  label,
  value,
}: HistorySummaryMetricProps): React.JSX.Element {
  return (
    <View style={styles.metric}>
      <Text numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
      <Text numberOfLines={1} style={styles.metricLabel}>
        {label}
      </Text>
    </View>
  );
}

export default function HistorySummaryStrip({
  summary,
}: HistorySummaryStripProps): React.JSX.Element {
  const { t } = useI18n();
  const latestPlace = [summary.latestCityLabel, summary.latestCountryLabel]
    .filter((value): value is string => Boolean(value))
    .join(', ');
  const latestLabel = latestPlace || t('history.summary.noLatest', '최근 기록 없음');

  return (
    <HistorySurfaceCard accentWashColor={colors.pearlSage}>
      <View
        accessibilityLabel={t('history.accessibility.summary', '히스토리 요약')}
        accessibilityRole="summary"
        style={styles.container}
      >
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.eyebrow}>
            {t('history.summary.eyebrow', '여행 저널')}
          </Text>
          <Text numberOfLines={1} style={styles.latest}>
            {latestLabel}
          </Text>
        </View>

        <View style={styles.metrics}>
          <HistorySummaryMetric
            label={t('history.summary.scans', '기록')}
            value={String(summary.totalCount)}
          />
          <HistorySummaryMetric
            label={t('history.summary.countries', '국가')}
            value={String(summary.countryCount)}
          />
          <View
            style={[
              styles.safeMetric,
              {
                backgroundColor: historyDashboardToneTokens.safe.backgroundColor,
                borderColor: historyDashboardToneTokens.safe.borderColor,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.safeValue,
                { color: historyDashboardToneTokens.safe.textColor },
              ]}
            >
              {summary.toneCounts.safe}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.safeLabel,
                { color: historyDashboardToneTokens.safe.textColor },
              ]}
            >
              {t('history.utility.safe', '안전')}
            </Text>
          </View>
        </View>
      </View>
    </HistorySurfaceCard>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  copy: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  eyebrow: {
    color: colors.inkSoft,
    fontSize: typography.caption,
    fontWeight: '800',
    letterSpacing: 0.6,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  latest: {
    color: colors.ink,
    fontSize: typography.bodyStrong,
    fontWeight: '800',
    lineHeight: 18,
  },
  metric: {
    alignItems: 'center',
    borderColor: colors.line,
    borderCurve: 'continuous',
    borderRadius: radii.sm,
    borderWidth: 1,
    minWidth: 52,
    paddingHorizontal: spacing.xs,
    paddingVertical: 6,
  },
  metricLabel: {
    color: colors.inkSoft,
    fontSize: typography.micro,
    fontWeight: '700',
    lineHeight: 12,
  },
  metricValue: {
    color: colors.ink,
    fontSize: typography.bodyStrong,
    fontWeight: '800',
    lineHeight: 17,
  },
  metrics: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  safeLabel: {
    fontSize: typography.micro,
    fontWeight: '800',
    lineHeight: 12,
  },
  safeMetric: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: radii.sm,
    borderWidth: 1,
    minWidth: 52,
    paddingHorizontal: spacing.xs,
    paddingVertical: 6,
  },
  safeValue: {
    fontSize: typography.bodyStrong,
    fontWeight: '800',
    lineHeight: 17,
  },
});
