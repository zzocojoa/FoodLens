import { DAY_ITEM_HALF_WIDTH, SNAP_INTERVAL, WEEKDAY_FORMATTER } from './constants';

export const isSameDay = (d1: Date, d2: Date): boolean => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

export const formatDateDay = (date: Date): string => {
  return WEEKDAY_FORMATTER.format(date);
};

export const formatDateNumber = (date: Date): number => {
  return date.getDate();
};

export const getScrollOffsetForIndex = (index: number, screenWidth: number): number => {
  return index * SNAP_INTERVAL - screenWidth / 2 + DAY_ITEM_HALF_WIDTH;
};

