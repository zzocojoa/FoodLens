import React, { useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { SNAP_INTERVAL } from './constants';
import { WeeklyDayItem } from './components/WeeklyDayItem';
import { useWeeklyStripAutoScroll } from './hooks/useWeeklyStripAutoScroll';
import { useWeeklyStatsStripModel } from './hooks/useWeeklyStatsStripModel';
import { weeklyStatsStripStyles as styles } from './styles';
import { WeeklyStatsStripProps } from './types';
import { useI18n } from '@/features/i18n';

export function WeeklyStatsStripView({
  weeklyData,
  selectedDate,
  onSelectDate,
}: WeeklyStatsStripProps) {
  const { locale } = useI18n();
  const scrollViewRef = useRef<ScrollView>(null);
  const { theme, handleSelectDate } = useWeeklyStatsStripModel(onSelectDate);

  useWeeklyStripAutoScroll({ scrollViewRef, weeklyData, selectedDate });

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={SNAP_INTERVAL}
      >
        {weeklyData.map((day, index) => (
          <WeeklyDayItem
            key={index}
            day={day}
            selectedDate={selectedDate}
            theme={theme}
            locale={locale}
            onPress={handleSelectDate}
          />
        ))}
      </ScrollView>
    </View>
  );
}
