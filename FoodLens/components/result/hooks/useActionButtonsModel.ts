import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { getActionButtonTheme } from '../utils/actionButtonTheme';

export function useActionButtonsModel() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const buttonTheme = getActionButtonTheme(colorScheme);

  return {
    buttonTheme,
    shadowColor: theme.shadow,
    onGoHome: () => router.replace('/'),
  };
}
