import { AnalysisRecord } from '../../../services/analysisService';
import { WeeklyData } from '../../../components/weeklyStatsStrip/types';

export const isSameDay = (d1: Date, d2: Date): boolean => {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

export const filterScansByDate = (
  allHistory: AnalysisRecord[],
  selectedDate: Date,
): AnalysisRecord[] => {
  const filtered = allHistory.filter((item) => isSameDay(item.timestamp, selectedDate));
  filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return filtered;
};

export const buildWeeklyStats = (
  allHistory: AnalysisRecord[],
  today: Date = new Date(),
): WeeklyData[] => {
  const currentDay = today.getDay();
  const baseSunday = new Date(today);
  baseSunday.setDate(today.getDate() - currentDay);

  const weekDates: Date[] = [];
  const previousDays = 20;
  const nextDays = 20;
  const currentWeekDays = 7;

  for (let i = -previousDays; i < currentWeekDays + nextDays; i++) {
    const date = new Date(baseSunday);
    date.setDate(baseSunday.getDate() + i);
    weekDates.push(date);
  }

  return weekDates.map((date) => {
    const dayItems = allHistory.filter((item) => isSameDay(item.timestamp, date));
    return {
      date,
      hasSafe: dayItems.some((i) => i.safetyStatus === 'SAFE'),
      hasDanger: dayItems.some((i) => i.safetyStatus === 'DANGER'),
      hasWarning: dayItems.some((i) => i.safetyStatus === 'CAUTION'),
      hasData: dayItems.length > 0,
    };
  });
};
