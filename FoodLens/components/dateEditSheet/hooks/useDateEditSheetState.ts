import { useCallback, useState } from 'react';

export const useDateEditSheetState = (initialDate: Date) => {
  const [tempDate, setTempDate] = useState(initialDate);

  const handleDateChange = useCallback((_event: unknown, selectedDate?: Date) => {
    if (selectedDate) {
      setTempDate(selectedDate);
    }
  }, []);

  return {
    tempDate,
    handleDateChange,
  };
};
