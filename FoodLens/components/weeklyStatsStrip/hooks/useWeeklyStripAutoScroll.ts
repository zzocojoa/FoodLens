import { RefObject, useEffect } from 'react';
import { Dimensions, ScrollView } from 'react-native';
import { WeeklyData } from '../types';
import { getScrollOffsetForIndex, isSameDay } from '../utils';

type Params = {
  scrollViewRef: RefObject<ScrollView | null>;
  weeklyData: WeeklyData[];
  selectedDate: Date;
};

export const useWeeklyStripAutoScroll = ({
  scrollViewRef,
  weeklyData,
  selectedDate,
}: Params): void => {
  useEffect(() => {
    const index = weeklyData.findIndex((day) => isSameDay(day.date, selectedDate));
    if (index === -1 || !scrollViewRef.current) return;

    const timeoutId = setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        x: getScrollOffsetForIndex(index, Dimensions.get('window').width),
        animated: true,
      });
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [selectedDate, weeklyData, scrollViewRef]);
};
