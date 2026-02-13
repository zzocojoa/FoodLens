import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { STATUS_DOT_COLORS } from '../constants';
import { weeklyStatsStripStyles as styles } from '../styles';
import { WeeklyData } from '../types';
import { formatDateDay, formatDateNumber, isSameDay } from '../utils';

type WeeklyDayItemProps = {
  day: WeeklyData;
  selectedDate: Date;
  theme: any;
  locale: string;
  onPress: (date: Date) => void;
};

export function WeeklyDayItem({ day, selectedDate, theme, locale, onPress }: WeeklyDayItemProps) {
  const selected = isSameDay(day.date, selectedDate);
  const today = isSameDay(day.date, new Date());
  const empty = !day.hasData;

  return (
    <TouchableOpacity
      onPress={() => onPress(day.date)}
      activeOpacity={0.7}
      style={[
        styles.dayItem,
        selected
          ? [styles.selectedItem, { backgroundColor: theme.textPrimary, borderColor: theme.textPrimary }]
          : styles.unselectedItem,
      ]}
    >
      <Text style={[styles.dayLabel, selected ? { color: theme.background } : { color: theme.textSecondary }]}>
        {formatDateDay(day.date, locale)}
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
            {day.hasSafe && <View style={[styles.statusDot, { backgroundColor: STATUS_DOT_COLORS.safe }]} />}
            {day.hasDanger && <View style={[styles.statusDot, { backgroundColor: STATUS_DOT_COLORS.danger }]} />}
            {day.hasWarning && <View style={[styles.statusDot, { backgroundColor: STATUS_DOT_COLORS.warning }]} />}
          </>
        ) : (
          <View style={[styles.statusDot, { backgroundColor: 'transparent' }]} />
        )}
      </View>

      {today && !selected && <View style={styles.todayIndicator} />}
    </TouchableOpacity>
  );
}
