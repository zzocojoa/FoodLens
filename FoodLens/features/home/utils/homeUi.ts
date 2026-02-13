import { isSameDay } from './homeDashboard';

type ScanBadge = {
  label: 'OK' | 'AVOID' | 'ASK';
  backgroundColor: string;
  textColor: string;
};

export const getHomeScanStatusBadge = (status: string): ScanBadge => {
  switch (status) {
    case 'SAFE':
      return { label: 'OK', backgroundColor: '#DCFCE7', textColor: '#15803D' };
    case 'DANGER':
      return { label: 'AVOID', backgroundColor: '#FFE4E6', textColor: '#BE123C' };
    default:
      return { label: 'ASK', backgroundColor: '#FEF3C7', textColor: '#B45309' };
  }
};

export const formatHomeSectionTitle = (selectedDate: Date): string => {
  if (isSameDay(selectedDate, new Date())) return 'Recent Scans';
  return `Scans on ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    selectedDate,
  )}`;
};

