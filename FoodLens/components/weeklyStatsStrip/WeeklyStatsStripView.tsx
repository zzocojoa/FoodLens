import React, { useRef } from 'react';
import { ScrollView, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { SNAP_INTERVAL } from './constants';
import { WeeklyDayItem } from './components/WeeklyDayItem';
import { useWeeklyStripAutoScroll } from './hooks/useWeeklyStripAutoScroll';
import { weeklyStatsStripStyles as styles } from './styles';
import { WeeklyStatsStripProps } from './types';

export function WeeklyStatsStripView({
  weeklyData,
  selectedDate,
  onSelectDate,
}: WeeklyStatsStripProps) {
  const scrollViewRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

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
            onPress={(date) => {
              Haptics.selectionAsync();
              onSelectDate(date);
            }}
          />
        ))}
      </ScrollView>
    </View>
  );
}
