import React, { useRef } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { SNAP_INTERVAL, STATUS_DOT_COLORS } from './constants';
import { useWeeklyStripAutoScroll } from './hooks/useWeeklyStripAutoScroll';
import { weeklyStatsStripStyles as styles } from './styles';
import { WeeklyStatsStripProps } from './types';
import { formatDateDay, formatDateNumber, isSameDay } from './utils';

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
        {weeklyData.map((day, index) => {
          const selected = isSameDay(day.date, selectedDate);
          const today = isSameDay(day.date, new Date());
          const empty = !day.hasData;

          return (
            <TouchableOpacity
              key={index}
              onPress={() => {
                Haptics.selectionAsync();
                onSelectDate(day.date);
              }}
              activeOpacity={0.7}
              style={[
                styles.dayItem,
                selected
                  ? [
                      styles.selectedItem,
                      { backgroundColor: theme.textPrimary, borderColor: theme.textPrimary },
                    ]
                  : styles.unselectedItem,
              ]}
            >
              <Text style={[styles.dayLabel, selected ? { color: theme.background } : { color: theme.textSecondary }]}>
                {formatDateDay(day.date)}
              </Text>

              <Text
                style={[
                  styles.dateNumber,
                  selected
                    ? { color: theme.background }
                    : empty
                      ? { color: theme.textSecondary + '40' }
                      : { color: theme.textPrimary },
                ]}
              >
                {formatDateNumber(day.date)}
              </Text>

              <View style={styles.dotsContainer}>
                {day.hasData ? (
                  <>
                    {day.hasSafe && (
                      <View style={[styles.statusDot, { backgroundColor: STATUS_DOT_COLORS.safe }]} />
                    )}
                    {day.hasDanger && (
                      <View style={[styles.statusDot, { backgroundColor: STATUS_DOT_COLORS.danger }]} />
                    )}
                    {day.hasWarning && (
                      <View style={[styles.statusDot, { backgroundColor: STATUS_DOT_COLORS.warning }]} />
                    )}
                  </>
                ) : (
                  <View style={[styles.statusDot, { backgroundColor: 'transparent' }]} />
                )}
              </View>

              {today && !selected && <View style={styles.todayIndicator} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

