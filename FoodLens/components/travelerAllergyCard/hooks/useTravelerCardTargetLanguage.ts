import { useI18nSnapshot } from '@/features/i18n/services/i18nStore_Logic';

export const useTravelerCardTargetLanguage = () => {
  const snapshot = useI18nSnapshot();
  return snapshot.settings.targetLanguage ?? undefined;
};
