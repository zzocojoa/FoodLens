import { useCallback } from 'react';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { HapticsService } from '@/services/haptics';

export const useWeeklyStatsStripModel = (onSelectDate: (date: Date) => void) => {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  const handleSelectDate = useCallback(
    (date: Date) => {
      HapticsService.selection();
      onSelectDate(date);
    },
    [onSelectDate]
  );

  return {
    theme,
    handleSelectDate,
  };
};
