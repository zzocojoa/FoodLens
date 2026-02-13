export interface DateEditSheetProps {
  isVisible: boolean;
  initialDate: Date;
  onClose: () => void;
  onConfirm: (date: Date) => void;
  locale?: string;
  t?: (key: string, fallback?: string) => string;
}
