export interface WeeklyData {
  date: Date;
  hasSafe: boolean;
  hasDanger: boolean;
  hasWarning: boolean;
  hasData: boolean;
}

export interface WeeklyStatsStripProps {
  weeklyData: WeeklyData[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

