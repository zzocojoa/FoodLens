import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { WeeklyData } from '../../../components/weeklyStatsStrip/types';
import { homeDashboardStyles } from './homeDashboardStyles';
import PearlSurfaceOverlay from './PearlSurfaceOverlay';
import {
  homeDashboardColors,
  homeDashboardRadii,
  homeDashboardSpacing,
  homeDashboardTypography,
} from './homeDashboardTokens';

type HomeWeekPulseProps = {
  locale: string;
  metaLabel: string;
  selectedDate: Date;
  title: string;
  weeklyStats: WeeklyData[];
};

type WeekSignalTone = 'SAFE' | 'CAUTION' | 'DANGER' | 'EMPTY';

const resolveWeekSignalTone = (item: WeeklyData): WeekSignalTone => {
  if (item.hasDanger) {
    return 'DANGER';
  }

  if (item.hasWarning) {
    return 'CAUTION';
  }

  if (item.hasSafe) {
    return 'SAFE';
  }

  return 'EMPTY';
};

const isSameDay = (left: Date, right: Date): boolean => {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
};

const getWeekStart = (value: Date): Date => {
  const weekStart = new Date(value);
  weekStart.setDate(value.getDate() - value.getDay());
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};

const getWeekItems = (weeklyStats: WeeklyData[], selectedDate: Date): WeeklyData[] => {
  const weekStart = getWeekStart(selectedDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return weeklyStats.filter((item) => {
    const time = item.date.getTime();
    return time >= weekStart.getTime() && time <= weekEnd.getTime();
  });
};

const getDayLabel = (date: Date, locale: string): string => {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
  }).format(date);
};

const getSignalColor = (tone: WeekSignalTone): string => {
  if (tone === 'DANGER') {
    return homeDashboardColors.accentRed;
  }

  if (tone === 'CAUTION') {
    return homeDashboardColors.accentAmber;
  }

  if (tone === 'SAFE') {
    return homeDashboardColors.accentGreen;
  }

  return homeDashboardColors.lineStrong;
};

export function HomeWeekPulse({
  locale,
  metaLabel,
  selectedDate,
  title,
  weeklyStats,
}: HomeWeekPulseProps) {
  const weekItems = React.useMemo(
    () => getWeekItems(weeklyStats, selectedDate),
    [selectedDate, weeklyStats]
  );

  return (
    <View style={[homeDashboardStyles.sectionCard, styles.container]}>
      <PearlSurfaceOverlay
        accentWashColor={homeDashboardColors.pearlMist}
        baseBottomColor="#FFF8F0"
        baseTopColor={homeDashboardColors.pearlIvory}
        coolWashColor={homeDashboardColors.pearlSage}
        warmWashColor={homeDashboardColors.pearlPeach}
      />
      <View style={homeDashboardStyles.sectionHeaderRow}>
        <Text style={homeDashboardStyles.sectionTitle}>{title}</Text>
        <View style={homeDashboardStyles.pill}>
          <Text style={homeDashboardStyles.pillText}>{metaLabel}</Text>
        </View>
      </View>

      <View style={styles.strip}>
        {weekItems.map((item) => {
          const tone = resolveWeekSignalTone(item);
          const isSelected = isSameDay(item.date, selectedDate);

          return (
            <View
              key={item.date.toISOString()}
              style={[
                styles.dayCard,
                isSelected ? styles.dayCardSelected : null,
              ]}
            >
              <Text style={[styles.dayLabel, isSelected ? styles.dayLabelSelected : null]}>
                {getDayLabel(item.date, locale)}
              </Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={[styles.dayNumber, isSelected ? styles.dayNumberSelected : null]}
              >
                {item.date.getDate()}
              </Text>
              <View
                style={[
                  styles.signalDot,
                  { backgroundColor: getSignalColor(tone) },
                  tone === 'EMPTY' ? styles.signalDotEmpty : null,
                ]}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  strip: {
    flexDirection: 'row',
    gap: 6,
  },
  dayCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderRadius: homeDashboardRadii.sm,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    backgroundColor: homeDashboardColors.surfaceStrong,
  },
  dayCardSelected: {
    borderColor: 'rgba(36, 56, 93, 0.24)',
    backgroundColor: homeDashboardColors.chip,
  },
  dayLabel: {
    fontSize: homeDashboardTypography.micro,
    lineHeight: 12,
    fontWeight: '700',
    color: homeDashboardColors.inkSoft,
  },
  dayLabelSelected: {
    color: homeDashboardColors.accentBlue,
  },
  dayNumber: {
    width: '100%',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
    color: homeDashboardColors.ink,
  },
  dayNumberSelected: {
    color: homeDashboardColors.accentBlue,
  },
  signalDot: {
    width: 8,
    height: 8,
    borderRadius: homeDashboardRadii.pill,
  },
  signalDotEmpty: {
    opacity: 0.7,
  },
});

export default HomeWeekPulse;
