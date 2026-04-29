import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/features/i18n';

import type { HistoryJournalSummary } from '../types/historyViewModel.types';
import HistorySurfaceCard from './HistorySurfaceCard';
import {
  getHistoryDashboardToneTokens,
  historyDashboardColors,
  historyDashboardRadii as radii,
  historyDashboardSpacing as spacing,
  historyDashboardTypography as typography,
  type HistoryDashboardColors,
} from './historyDashboardTokens';

type HistorySummaryStripProps = {
  colors: HistoryDashboardColors;
  summary: HistoryJournalSummary;
};

type HistorySummaryMetricProps = {
  colors: HistoryDashboardColors;
  label: string;
  value: string;
};

function HistorySummaryMetric({
  colors,
  label,
  value,
}: HistorySummaryMetricProps): React.JSX.Element {
  return (
    <View style={[styles.metric, { borderColor: colors.line }]}>
      <Text numberOfLines={1} style={[styles.metricValue, { color: colors.ink }]}>
        {value}
      </Text>
      <Text numberOfLines={1} style={[styles.metricLabel, { color: colors.inkSoft }]}>
        {label}
      </Text>
    </View>
  );
}

export default function HistorySummaryStrip({
  colors,
  summary,
}: HistorySummaryStripProps): React.JSX.Element {
  const { t } = useI18n();
  const toneTokens = getHistoryDashboardToneTokens(colors);
  const latestPlace = [summary.latestCityLabel, summary.latestCountryLabel]
    .filter((value): value is string => Boolean(value))
    .join(', ');
  const latestLabel = latestPlace || t('history.summary.noLatest', '최근 기록 없음');

  return (
    <HistorySurfaceCard accentWashColor={colors.pearlSage} colors={colors}>
      <View
        accessibilityLabel={t('history.accessibility.summary', '히스토리 요약')}
        accessibilityRole="summary"
        style={styles.container}
      >
        <View style={styles.copy}>
          <Text numberOfLines={1} style={[styles.eyebrow, { color: colors.inkSoft }]}>
            {t('history.summary.eyebrow', '여행 저널')}
          </Text>
          <Text numberOfLines={1} style={[styles.latest, { color: colors.ink }]}>
            {latestLabel}
          </Text>
        </View>

        <View style={styles.metrics}>
          <HistorySummaryMetric
            colors={colors}
            label={t('history.summary.scans', '기록')}
            value={String(summary.totalCount)}
          />
          <HistorySummaryMetric
            colors={colors}
            label={t('history.summary.countries', '국가')}
            value={String(summary.countryCount)}
          />
          <View
            style={[
              styles.safeMetric,
              {
                backgroundColor: toneTokens.safe.backgroundColor,
                borderColor: toneTokens.safe.borderColor,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.safeValue,
                { color: toneTokens.safe.textColor },
              ]}
            >
              {summary.toneCounts.safe}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.safeLabel,
                { color: toneTokens.safe.textColor },
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
    color: historyDashboardColors.inkSoft,
    fontSize: typography.caption,
    fontWeight: '800',
    letterSpacing: 0.6,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  latest: {
    color: historyDashboardColors.ink,
    fontSize: typography.bodyStrong,
    fontWeight: '800',
    lineHeight: 18,
  },
  metric: {
    alignItems: 'center',
    borderColor: historyDashboardColors.line,
    borderCurve: 'continuous',
    borderRadius: radii.sm,
    borderWidth: 1,
    minWidth: 52,
    paddingHorizontal: spacing.xs,
    paddingVertical: 6,
  },
  metricLabel: {
    color: historyDashboardColors.inkSoft,
    fontSize: typography.micro,
    fontWeight: '700',
    lineHeight: 12,
  },
  metricValue: {
    color: historyDashboardColors.ink,
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
